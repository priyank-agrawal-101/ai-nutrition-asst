import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Database } from "../../src/server/db/connection";
import { loadConfig } from "../../src/server/config";
import { createHandler } from "../../src/server/http";
import { TurnService } from "../../src/server/turn-service";
import { frontendProxy } from "../../src/server/frontend-proxy";
import { configEnv } from "../support/config";
import { groqSettings } from "../../src/server/llm/settings";
import {
  ScriptedProvider,
  allow,
  answer,
  review,
} from "../support/scripted-provider";
import {
  envelope,
  sessionSchema,
  conversationSchema,
  operationSchema,
} from "../../src/contracts/api";

let db: Database;
beforeAll(() => {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_RUN_ID)
    throw new Error("Isolated harness required");
  db = new Database(process.env.TEST_DATABASE_URL);
});
afterAll(async () => {
  await db?.close();
});
const secret = Buffer.alloc(32, 6).toString("base64url");
const front = {
  APP_ENV: "production",
  APP_ROLE: "frontend",
  VERCEL: "1",
  VERCEL_ENV: "production",
  APP_ORIGIN: "https://nutrition.example.com",
  BACKEND_ORIGIN: "https://backend.example.com",
  PROXY_SHARED_SECRET: secret,
};
function setup() {
  const config = loadConfig({
    ...configEnv(),
    APP_ENV: "production",
    APP_ROLE: "backend",
    APP_ORIGIN: front.APP_ORIGIN,
    PROVIDER_MODE: "groq",
    GROQ_API_KEY: "synthetic-never-dispatched",
    PROXY_SHARED_SECRET: secret,
  });
  // Explicit scripted injection: never instantiate a live provider in this test.
  const provider = new ScriptedProvider(
    [allow(), answer(), review()].map((entry) => ({
      ...entry,
      result: {
        ...entry.result,
        reportedModel: groqSettings.model,
        inputTokens: 10,
        outputTokens: 10,
      },
    })),
  );
  const handler = createHandler(
    db,
    config,
    new TurnService(db, config, provider),
    () => {},
  );
  const transport: typeof fetch = async (input, init) =>
    handler(new Request(input, init));
  const call = (
    path: string,
    body?: object,
    cookie?: string,
    csrf?: string,
    ip = "203.0.113.31",
  ) =>
    frontendProxy(
      new Request(`${front.APP_ORIGIN}/api/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "x-vercel-forwarded-for": ip,
          origin: front.APP_ORIGIN,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      front,
      transport,
    );
  return { handler, provider, call };
}
describe("Production proxy with real isolated PostgreSQL", () => {
  it("EC-SEC-05 EC-SEC-06 EC-UI-06 preserves cookie ownership, CSRF and stored recovery", async () => {
    const { call, provider, handler } = setup();
    expect(
      (await handler(new Request(`${front.BACKEND_ORIGIN}/api/v1/session`)))
        .status,
    ).toBe(403);
    const bootstrap = await call("session", {});
    expect(bootstrap.status).toBe(201);
    const cookie = bootstrap.headers.get("set-cookie")!;
    expect(cookie).toContain("__Host-nutrition_session=");
    expect(cookie).toContain("; Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Domain=");
    const token = cookie.split(";")[0]!;
    const parsed = envelope(sessionSchema).parse(await bootstrap.json());
    if (!("data" in parsed)) throw new Error("No session");
    const csrf = parsed.data.csrf_token;
    expect(
      (
        await call(
          "conversations",
          { client_conversation_id: randomUUID() },
          token,
          "wrong",
        )
      ).status,
    ).toBe(403);
    const created = envelope(conversationSchema).parse(
      await (
        await call(
          "conversations",
          { client_conversation_id: randomUUID() },
          token,
          csrf,
        )
      ).json(),
    );
    if (!("data" in created)) throw new Error("No conversation");
    const id = created.data.id;
    const submission = randomUUID();
    const result = envelope(operationSchema).parse(
      await (
        await call(
          `conversations/${id}/turns`,
          { client_submission_id: submission, question: "Explain steaming." },
          token,
          csrf,
        )
      ).json(),
    );
    if (!("data" in result)) throw new Error(`No result: ${result.error.code}`);
    expect(result.data.turn.status).toBe("completed");
    const recovered = await call(`conversations/${id}`, undefined, token);
    expect(recovered.status).toBe(200);
    expect(await recovered.text()).toContain("Explain steaming.");
    const other = await call(
      "session",
      {},
      undefined,
      undefined,
      "203.0.113.32",
    );
    const otherCookie = other.headers.get("set-cookie")!.split(";")[0]!;
    expect(
      (await call(`conversations/${id}`, undefined, otherCookie)).status,
    ).toBe(404);
    provider.done();
  });
  it("EC-OPS-04 separates network quotas and does not trust arbitrary forwarded headers", async () => {
    const { call } = setup();
    for (let i = 0; i < 10; i++)
      expect(
        (await call("session", {}, undefined, undefined, "203.0.113.40"))
          .status,
      ).toBe(201);
    expect(
      (await call("session", {}, undefined, undefined, "::ffff:203.0.113.40"))
        .status,
    ).toBe(429);
    expect(
      (await call("session", {}, undefined, undefined, "203.0.113.41")).status,
    ).toBe(201);
  });
});
