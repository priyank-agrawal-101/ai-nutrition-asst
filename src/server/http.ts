import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  createSchema,
  submitSchema,
  retrySchema,
  emptySchema,
  uuid,
  operationId,
  envelope,
  sessionSchema,
  conversationSchema,
  operationSchema,
  turnReadSchema,
  lookupSchema,
  apiErrorSchema,
  metaSchema,
} from "@/contracts/api";
import { AppError, publicError, statusFor } from "./errors";
import { readJson } from "./validation/json";
import {
  cookieToken,
  getSession,
  establish,
  csrf,
  verifyCsrf,
  lockSession,
} from "./security";
import { charge } from "./quotas";
import type { Config } from "./config";
import type { Database } from "./db/connection";
import type { TurnService } from "./turn-service";
import type { EventSink } from "./telemetry";
import migrationManifest from "./db/migration-manifest.json";
import { latestSavedConversation } from "./db/conversations";

export function createHandler(
  database: Database,
  config: Config,
  turns: TurnService,
  sink: EventSink,
) {
  return async (request: Request): Promise<Response> => {
    const start = Date.now(),
      requestId = randomUUID();
    const meta = {
      request_id: requestId,
      server_time: new Date().toISOString(),
    };
    let mutation = false,
      creation = false,
      allow = "GET";
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Request-ID": requestId,
    });
    const success = <T extends z.ZodType>(
      schema: T,
      data: unknown,
      status = 200,
    ): Response => {
      const value = envelope(schema).parse({ data, meta });
      return new Response(JSON.stringify(value), { status, headers });
    };
    let response: Response;
    try {
      const url = new URL(request.url),
        path = url.pathname
          .replace(/^\/api\/v1\/?/, "")
          .split("/")
          .filter(Boolean);
      if (
        url.search ||
        (request.method === "GET" &&
          (request.body !== null ||
            Number(request.headers.get("content-length") ?? 0) > 0))
      )
        throw new AppError("INVALID_REQUEST", "not_applicable");
      const root = path[0],
        cid = path[1],
        branch = path[2],
        rid = path[3];
      let endpoint: string;
      if (root === "session" && path.length === 1) {
        endpoint = "session";
        allow = "GET, POST";
      } else if (
        root === "health" &&
        path.length === 2 &&
        ["live", "ready"].includes(cid ?? "")
      )
        endpoint = `health/${cid}`;
      else if (root === "conversations" && path.length === 1) {
        endpoint = "create";
        allow = "POST";
      } else if (root === "conversations" && cid && path.length === 2)
        endpoint = "conversation";
      else if (
        root === "conversations" &&
        cid &&
        branch === "turns" &&
        path.length === 3
      ) {
        endpoint = "submit";
        allow = "POST";
      } else if (
        root === "conversations" &&
        cid &&
        branch === "turns" &&
        rid &&
        path.length === 4
      )
        endpoint = "turn";
      else if (
        root === "conversations" &&
        cid &&
        branch === "submissions" &&
        rid &&
        path.length === 4
      )
        endpoint = "lookup";
      else if (
        root === "conversations" &&
        cid &&
        branch === "turns" &&
        rid &&
        path[4] === "attempts" &&
        path.length === 5
      ) {
        endpoint = "retry";
        allow = "POST";
      } else throw new AppError("ENDPOINT_NOT_FOUND", "not_applicable");
      if (!allow.split(", ").includes(request.method)) {
        headers.set("Allow", allow);
        throw new AppError("METHOD_NOT_ALLOWED", "not_applicable");
      }
      if (root === "conversations" && cid && !uuid.safeParse(cid).success)
        throw new AppError("INVALID_REQUEST");
      if (
        rid &&
        !(branch === "submissions" ? operationId : uuid).safeParse(rid).success
      )
        throw new AppError("INVALID_REQUEST");
      if (endpoint === "health/live")
        return success(z.strictObject({ status: z.literal("ok") }), {
          status: "ok",
        });
      if (endpoint === "health/ready") {
        try {
          const result = await database.db.execute(
            sql`select version,checksum from schema_migrations order by version`,
          );
          if (
            !z
              .array(z.object({ version: z.string(), checksum: z.string() }))
              .length(migrationManifest.migrations.length)
              .safeParse(result.rows).success ||
            JSON.stringify(result.rows) !==
              JSON.stringify(migrationManifest.migrations)
          )
            throw new Error("Schema mismatch");
          const role = await database.db.execute(
            sql`select rolsuper,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user`,
          );
          if (
            !z
              .array(
                z.object({
                  rolsuper: z.literal(false),
                  rolcreatedb: z.literal(false),
                  rolcreaterole: z.literal(false),
                }),
              )
              .length(1)
              .safeParse(role.rows).success
          )
            throw new Error("Runtime privileges invalid");
        } catch {
          throw new AppError(
            "SERVICE_NOT_READY",
            "not_applicable",
            "repeat_request",
          );
        }
        return success(z.strictObject({ status: z.literal("ready") }), {
          status: "ready",
        });
      }
      const post = request.method === "POST";
      let body: unknown;
      if (post) {
        if (request.headers.get("origin") !== config.origin)
          throw new AppError("REQUEST_FORBIDDEN");
        body = await readJson(request);
      }
      const requestSchema =
        endpoint === "session"
          ? emptySchema
          : endpoint === "create"
            ? createSchema
            : endpoint === "submit"
              ? submitSchema
              : endpoint === "retry"
                ? retrySchema
                : null;
      if (post && requestSchema && !requestSchema.safeParse(body).success)
        throw new AppError("VALIDATION_FAILED");
      // Only loopback/test profiles exist in Phase 1. Forwarded headers are deliberately ignored.
      const network = "loopback";
      const token = cookieToken(request, config);
      let session = await getSession(database.db, token);
      await database.transaction("read_quota", async (db) => {
        if (session) await lockSession(db, session.id);
        await charge(db, config, "read", session?.id ?? null, network);
      });
      if (endpoint === "session" && post) {
        const established = await establish(database, config, token, network);
        session = established.session;
        if (established.token)
          headers.set(
            "Set-Cookie",
            `${config.cookieName}=${established.token}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(session.expires_at).toUTCString()}`,
          );
        response = success(
          sessionSchema,
          {
            expires_at: session.expires_at,
            latest_conversation_id: await latestSavedConversation(
              database.db,
              session.id,
            ),
            csrf_token: csrf(session, config),
            limits: config.limits,
            provider_mode: config.providerMode,
            diagnostics_enabled: config.diagnosticsEnabled,
            generation_enabled: config.generationEnabled,
          },
          established.token ? 201 : 200,
        );
      } else {
        if (!session)
          throw new AppError("SESSION_UNAVAILABLE", "not_applicable");
        if (post)
          verifyCsrf(request.headers.get("x-csrf-token"), session, config);
        if (endpoint === "session")
          response = success(sessionSchema, {
            expires_at: session.expires_at,
            latest_conversation_id: await latestSavedConversation(
              database.db,
              session.id,
            ),
            csrf_token: csrf(session, config),
            limits: config.limits,
            provider_mode: config.providerMode,
            diagnostics_enabled: config.diagnosticsEnabled,
            generation_enabled: config.generationEnabled,
          });
        else if (endpoint === "create") {
          mutation = true;
          creation = true;
          const data = createSchema.parse(body);
          const result = await turns.create(
            session.id,
            data.client_conversation_id,
            network,
          );
          headers.set(
            "Location",
            `/api/v1/conversations/${result.conversation.id}`,
          );
          response = success(
            conversationSchema,
            result.conversation,
            result.replayed ? 200 : 201,
          );
        } else if (cid) {
          if (endpoint === "submit" || endpoint === "retry") {
            mutation = true;
            const result =
              endpoint === "submit"
                ? await (async () => {
                    const b = submitSchema.parse(body);
                    return turns.submit(
                      session.id,
                      cid,
                      b.client_submission_id,
                      b.question,
                      network,
                    );
                  })()
                : await (async () => {
                    const b = retrySchema.parse(body);
                    if (!rid) throw new AppError("INVALID_REQUEST");
                    return turns.retry(
                      session.id,
                      cid,
                      rid,
                      b.client_attempt_id,
                      b.failed_attempt_id,
                      network,
                    );
                  })();
            if (
              !result.operation.replayed &&
              result.turn.status === "failed" &&
              result.turn.current_attempt.id === result.operation.attempt_id &&
              result.turn.failure
            )
              throw new AppError(
                result.turn.failure.code,
                "accepted",
                "check_status",
                result.turn.failure.retry_at
                  ? Math.max(
                      1,
                      Math.ceil(
                        (Date.parse(result.turn.failure.retry_at) -
                          Date.now()) /
                          1000,
                      ),
                    )
                  : undefined,
              );
            headers.set(
              "Location",
              `/api/v1/conversations/${cid}/turns/${result.turn.id}`,
            );
            response = success(
              operationSchema,
              result,
              result.operation.replayed ||
                result.turn.status !== "completed" ||
                result.turn.current_attempt.id !== result.operation.attempt_id
                ? 200
                : 201,
            );
          } else {
            const c = await turns.read(session.id, cid);
            if (endpoint === "conversation")
              response = success(conversationSchema, c);
            else if (endpoint === "lookup") {
              const turn =
                c.turns.find((t) => t.client_submission_id === rid) ?? null;
              response = success(lookupSchema, {
                recorded: turn !== null,
                turn,
              });
            } else {
              const turn = c.turns.find((t) => t.id === rid);
              if (!turn)
                throw new AppError(
                  "TURN_UNAVAILABLE",
                  "not_applicable",
                  "reload_conversation",
                );
              response = success(turnReadSchema, { turn });
            }
          }
        } else throw new AppError("ENDPOINT_NOT_FOUND", "not_applicable");
      }
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              "STORAGE_UNAVAILABLE",
              mutation ? "unknown" : "not_applicable",
              mutation && !creation ? "check_status" : "repeat_request",
            );
      const mapped = publicError(appError);
      if (mapped.recovery.retry_after_seconds)
        headers.set("Retry-After", String(mapped.recovery.retry_after_seconds));
      const value = z
        .strictObject({ error: apiErrorSchema, meta: metaSchema })
        .parse({ error: mapped, meta });
      response = new Response(JSON.stringify(value), {
        status: statusFor(appError.code),
        headers,
      });
    }
    sink({
      event: "request",
      request_id: requestId,
      status: response.status,
      duration_ms: Date.now() - start,
    });
    return response;
  };
}
