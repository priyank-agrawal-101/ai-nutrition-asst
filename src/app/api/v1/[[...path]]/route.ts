import { getApplication } from "@/server/runtime";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  // Liveness remains available when configuration/storage is broken.
  if (
    new URL(request.url).pathname === "/api/v1/health/live" &&
    request.method === "GET" &&
    !new URL(request.url).search &&
    !request.body &&
    !Number(request.headers.get("content-length") ?? 0)
  ) {
    const id = randomUUID();
    return Response.json(
      {
        data: { status: "ok" },
        meta: { request_id: id, server_time: new Date().toISOString() },
      },
      { headers: { "Cache-Control": "no-store", "X-Request-ID": id } },
    );
  }
  try {
    const app = await getApplication();
    return await app.handler(request);
  } catch {
    const id = randomUUID();
    return Response.json(
      {
        error: {
          code: "SERVICE_NOT_READY",
          message: "The local service is not configured.",
          operation_state: "not_applicable",
          field_errors: [],
          recovery: {
            action: "repeat_request",
            conversation_id: null,
            client_submission_id: null,
            turn_id: null,
            client_attempt_id: null,
            retry_after_seconds: null,
          },
        },
        meta: { request_id: id, server_time: new Date().toISOString() },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Request-ID": id },
      },
    );
  }
}
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
