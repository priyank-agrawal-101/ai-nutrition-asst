import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  Database,
  rows,
  type TransactionFault,
} from "../../src/server/db/connection";
import { loadConfig } from "../../src/server/config";
import { establish } from "../../src/server/security";
import { TurnService } from "../../src/server/turn-service";
import { maintenance } from "../../src/server/maintenance";
import { fixtureResult } from "../../src/server/provider";
import { createHandler } from "../../src/server/http";
import {
  envelope,
  sessionSchema,
  conversationSchema,
  operationSchema,
  lookupSchema,
} from "../../src/contracts/api";
import {
  ScriptedProvider,
  allow,
  answer,
  review,
  gate,
} from "../support/scripted-provider";
import { configEnv } from "../support/config";
import { AppError } from "../../src/server/errors";
import { seedTurn } from "../support/seed-turn";
let db: Database, admin: Database;
const config = loadConfig(configEnv());
beforeAll(() => {
  if (
    !process.env.TEST_DATABASE_URL ||
    !process.env.TEST_MIGRATION_DATABASE_URL ||
    !process.env.TEST_RUN_ID
  )
    throw new Error("Run through the isolated database launcher");
  db = new Database(process.env.TEST_DATABASE_URL);
  admin = new Database(process.env.TEST_MIGRATION_DATABASE_URL);
});
afterAll(async () => {
  await db?.close();
  await admin?.close();
});
async function setup(
  provider = new ScriptedProvider([allow(), answer(), review()]),
  database = db,
) {
  const network = randomUUID();
  const { session } = await establish(database, config, null, network);
  const service = new TurnService(database, config, provider);
  const { conversation } = await service.create(
    session.id,
    randomUUID(),
    network,
  );
  return { session, service, conversation, provider, network };
}
async function count(
  table: "turns" | "messages" | "attempts" | "provider_calls",
  turnId: string,
) {
  const where =
    table === "turns"
      ? sql`id=${turnId}`
      : table === "provider_calls"
        ? sql`attempt_id in(select id from attempts where turn_id=${turnId})`
        : sql`turn_id=${turnId}`;
  const [r] = await rows(
    db.db,
    sql`select count(*)::int as n from ${sql.identifier(table)} where ${where}`,
    z.object({ n: z.number() }),
  );
  return r?.n;
}

describe("Durable PostgreSQL lifecycle", () => {
  it("EC-DATA-06/07 expired access is denied before scoped automatic purge", async () => {
    const a = await setup(),
      b = await setup(new ScriptedProvider([]));
    await a.service.submit(
      a.session.id,
      a.conversation.id,
      randomUUID(),
      "Expiry fixture",
      a.network,
    );
    await admin.db.execute(
      sql`update sessions set created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 second' where id=${a.session.id}`,
    );
    await expect(
      a.service.read(a.session.id, a.conversation.id),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    expect(
      (
        await rows(
          admin.db,
          sql`select id from conversations where id=${a.conversation.id}`,
          z.object({ id: z.string() }),
        )
      ).length,
    ).toBe(1);
    await maintenance(db, a.service, () => {});
    expect(
      (
        await rows(
          admin.db,
          sql`select id from conversations where id=${a.conversation.id}`,
          z.object({ id: z.string() }),
        )
      ).length,
    ).toBe(0);
    expect((await b.service.read(b.session.id, b.conversation.id)).id).toBe(
      b.conversation.id,
    );
    a.provider.done();
    b.provider.done();
  });
  it("EC-DATA-01/02/03 deferred constraints reject invalid final states independently of services", async () => {
    const f = await setup(new ScriptedProvider([]));
    await expect(
      db.transaction("bad_fixture", (tx) =>
        seedTurn(tx, f.conversation.id, { missingUser: true }),
      ),
    ).rejects.toThrow();
    await expect(
      db.transaction("bad_fixture", (tx) =>
        seedTurn(tx, f.conversation.id, { sequence: 2 }),
      ),
    ).rejects.toThrow();
    await expect(
      db.transaction("bad_fixture", (tx) =>
        seedTurn(tx, f.conversation.id, { wrongCurrent: randomUUID() }),
      ),
    ).rejects.toThrow();
    await expect(
      db.transaction("bad_fixture", (tx) =>
        seedTurn(tx, f.conversation.id, {
          content: {
            answer: "Invalid source",
            claims: [
              {
                text: "Fixture",
                source: { id: "s1", title: "Title", url: null, locator: null },
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      db.transaction("bad_fixture", (tx) =>
        seedTurn(tx, f.conversation.id, {
          content: { answer: "Extra keys", claims: [], extra: true },
        }),
      ),
    ).rejects.toThrow();
    expect(
      (await f.service.read(f.session.id, f.conversation.id)).turn_count,
    ).toBe(0);
    await db.transaction("valid_fixture", (tx) =>
      seedTurn(tx, f.conversation.id, {
        content: { answer: "Valid fixture", claims: [] },
      }),
    );
    expect(
      (await f.service.read(f.session.id, f.conversation.id)).turns[0]?.status,
    ).toBe("completed");
    f.provider.done();
  });
  it("EC-REQ-11/12 acceptance acknowledgement loss leaves running state and no dispatch", async () => {
    let injected = false;
    const connection = new Database(config.databaseUrl, (stage, label) => {
      if (stage === "after_commit" && label === "accept" && !injected) {
        injected = true;
        throw new Error("Lost acceptance acknowledgement");
      }
    });
    try {
      const f = await setup(new ScriptedProvider([]), connection),
        key = randomUUID();
      await expect(
        f.service.submit(
          f.session.id,
          f.conversation.id,
          key,
          "Uncertain acceptance",
          f.network,
        ),
      ).rejects.toMatchObject({ outcome: "unknown" });
      const replay = await f.service.submit(
        f.session.id,
        f.conversation.id,
        key,
        "Uncertain acceptance",
        f.network,
      );
      expect(replay.turn.status).toBe("running");
      expect(replay.operation.replayed).toBe(true);
      expect(await count("provider_calls", replay.turn.id)).toBe(0);
      await admin.db.execute(
        sql`update sessions set revoked_at=clock_timestamp() where id=${f.session.id}`,
      );
      await maintenance(db, f.service, () => {});
      f.provider.done();
    } finally {
      await connection.close();
    }
  });
  it("EC-MODEL-17 fresh database clock rejects a candidate after transaction began", async () => {
    const connection = new Database(
      config.databaseUrl,
      async (stage, label) => {
        if (stage === "before_work" && label === "complete")
          await admin.db.execute(sql`select pg_sleep(1.1)`);
      },
    );
    try {
      const provider = new ScriptedProvider([allow(), answer(), review()]),
        f = await setup(provider, connection);
      const service = new TurnService(
        connection,
        { ...config, limits: { ...config.limits, attempt_timeout_seconds: 1 } },
        provider,
      );
      const result = await service.submit(
        f.session.id,
        f.conversation.id,
        randomUUID(),
        "Deadline boundary",
        f.network,
      );
      expect(result.turn.failure?.code).toBe("ATTEMPT_TIMEOUT");
      expect(result.turn.assistant_message).toBeNull();
      expect(result.turn.conversation_revision).toBe(2);
      expect(
        (await service.read(f.session.id, f.conversation.id)).revision,
      ).toBe(2);
      provider.done();
    } finally {
      await connection.close();
    }
  });
  it("EC-REQ-09 retry cap and latest-turn eligibility are enforced", async () => {
    const provider = new ScriptedProvider(
        Array.from({ length: 3 }, () => [
          allow(),
          {
            phase: "answer" as const,
            result: fixtureResult({ invalid: true }),
          },
        ]).flat(),
      ),
      f = await setup(provider);
    let result = await f.service.submit(
      f.session.id,
      f.conversation.id,
      randomUUID(),
      "Fail repeatedly",
      f.network,
    );
    for (let i = 0; i < 2; i++)
      result = await f.service.retry(
        f.session.id,
        f.conversation.id,
        result.turn.id,
        randomUUID(),
        result.operation.attempt_id,
        f.network,
      );
    expect(result.turn.retry).toEqual({
      allowed: false,
      reason: "attempt_limit_reached",
      attempts_remaining: 0,
    });
    await expect(
      f.service.retry(
        f.session.id,
        f.conversation.id,
        result.turn.id,
        randomUUID(),
        result.operation.attempt_id,
        f.network,
      ),
    ).rejects.toMatchObject({ code: "RETRY_NOT_ALLOWED" });
    expect(await count("messages", result.turn.id)).toBe(1);
    expect(await count("attempts", result.turn.id)).toBe(3);
    provider.done();
  });
  it("EC-OPS-02 four occupied slots reject a fifth without accepting its question", async () => {
    const fixtures = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const entered = gate<void>(),
          release = gate<ReturnType<typeof fixtureResult>>(),
          provider = new ScriptedProvider([
            {
              phase: "input_safety",
              result: () => {
                entered.resolve();
                return release.promise;
              },
            },
            answer(),
            review(),
          ]);
        return { ...(await setup(provider)), entered, release };
      }),
    );
    const pending = fixtures.map((f) =>
      f.service.submit(
        f.session.id,
        f.conversation.id,
        randomUUID(),
        "Capacity",
        f.network,
      ),
    );
    try {
      await Promise.all(
        fixtures.map((f, i) =>
          Promise.race([
            f.entered.promise,
            pending[i]?.then(() => {
              throw new Error("Execution ended before barrier");
            }),
          ]),
        ),
      );
      const fifth = await setup(new ScriptedProvider([]));
      await expect(
        fifth.service.submit(
          fifth.session.id,
          fifth.conversation.id,
          randomUUID(),
          "Fifth",
          fifth.network,
        ),
      ).rejects.toMatchObject({ code: "GENERATION_UNAVAILABLE" });
      expect(
        (await fifth.service.read(fifth.session.id, fifth.conversation.id))
          .turn_count,
      ).toBe(0);
      fifth.provider.done();
    } finally {
      for (const f of fixtures)
        f.release.resolve(
          fixtureResult({ action: "allow", reason: "general_education" }),
        );
      await Promise.all(pending);
    }
    for (const f of fixtures) f.provider.done();
  });
  it("EC-REQ-01/02 EC-CTX-07 replay normalizes once, keeps messages and usage", async () => {
    const f = await setup(),
      key = randomUUID();
    const first = await f.service.submit(
      f.session.id,
      f.conversation.id,
      key,
      "  First\r\nquestion  ",
      f.network,
    );
    expect(first.turn.status).toBe("completed");
    expect(first.turn.conversation_revision).toBe(2);
    expect(first.turn.user_message.text).toBe("  First\r\nquestion  ");
    const replay = await f.service.submit(
      f.session.id,
      f.conversation.id,
      key,
      "First\nquestion",
      f.network,
    );
    expect(replay.operation).toEqual({
      attempt_id: first.operation.attempt_id,
      replayed: true,
    });
    await expect(
      f.service.submit(
        f.session.id,
        f.conversation.id,
        key,
        "Changed",
        f.network,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await count("messages", first.turn.id)).toBe(2);
    expect(await count("provider_calls", first.turn.id)).toBe(3);
    expect(
      f.provider.calls.map((c) => JSON.parse(c.context) as unknown),
    ).toHaveLength(3);
    expect(new Set(f.provider.calls.map((c) => c.context)).size).toBe(1);
    f.provider.done();
  });
  it("EC-REQ-07/08 failure then explicit retry retains original question and receipt", async () => {
    const provider = new ScriptedProvider([
      allow(),
      {
        phase: "answer",
        result: fixtureResult({
          answer: "Rejected",
          claims: [
            {
              text: "Claim",
              source: {
                id: "x",
                title: "Invalid in M1",
                url: null,
                locator: null,
              },
            },
          ],
        }),
      },
      allow(),
      answer(),
      review(),
    ]);
    const f = await setup(provider);
    const failed = await f.service.submit(
      f.session.id,
      f.conversation.id,
      randomUUID(),
      "Retry fixture",
      f.network,
    );
    expect(failed.turn.failure?.code).toBe("OUTPUT_INVALID");
    expect(failed.turn.assistant_message).toBeNull();
    const retryId = randomUUID();
    const completed = await f.service.retry(
      f.session.id,
      f.conversation.id,
      failed.turn.id,
      retryId,
      failed.operation.attempt_id,
      f.network,
    );
    expect(completed.turn.conversation_revision).toBe(4);
    expect(completed.turn.current_attempt.number).toBe(2);
    expect(await count("messages", failed.turn.id)).toBe(2);
    expect(await count("attempts", failed.turn.id)).toBe(2);
    const replay = await f.service.retry(
      f.session.id,
      f.conversation.id,
      failed.turn.id,
      retryId,
      failed.operation.attempt_id,
      f.network,
    );
    expect(replay.operation.replayed).toBe(true);
    await expect(
      f.service.retry(
        f.session.id,
        f.conversation.id,
        failed.turn.id,
        retryId,
        randomUUID(),
        f.network,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    provider.done();
  });
  it("EC-REQ-01/03 concurrent submissions serialize while provider is held", async () => {
    const entered = gate<void>(),
      release = gate<ReturnType<typeof fixtureResult>>();
    const provider = new ScriptedProvider([
      {
        phase: "input_safety",
        result: () => {
          entered.resolve();
          return release.promise;
        },
      },
      answer(),
      review(),
    ]);
    const f = await setup(provider),
      key = randomUUID();
    const pending = f.service.submit(
      f.session.id,
      f.conversation.id,
      key,
      "Concurrent",
      f.network,
    );
    await entered.promise;
    const replay = await f.service.submit(
      f.session.id,
      f.conversation.id,
      key,
      "Concurrent",
      f.network,
    );
    expect(replay.turn.status).toBe("running");
    expect(replay.operation.replayed).toBe(true);
    await expect(
      f.service.submit(
        f.session.id,
        f.conversation.id,
        randomUUID(),
        "Second",
        f.network,
      ),
    ).rejects.toMatchObject({ code: "CONVERSATION_BUSY" });
    release.resolve(
      fixtureResult({ action: "allow", reason: "general_education" }),
    );
    const result = await pending;
    expect(result.turn.status).toBe("completed");
    expect(await count("turns", result.turn.id)).toBe(1);
    provider.done();
  });
  it.each(["before_commit", "after_commit"] as const)(
    "EC-REQ-12 real completion %s fault never duplicates or leaks uncommitted output",
    async (stage) => {
      let injected = false;
      const fault: TransactionFault = (at, label) => {
        if (!injected && at === stage && label === "complete") {
          injected = true;
          throw new Error("Synthetic acknowledgement loss");
        }
      };
      const connection = new Database(config.databaseUrl, fault);
      try {
        const f = await setup(undefined, connection);
        const result = await f.service.submit(
          f.session.id,
          f.conversation.id,
          randomUUID(),
          "Commit fixture",
          f.network,
        );
        expect(injected).toBe(true);
        expect(result.turn.status).toBe(
          stage === "after_commit" ? "completed" : "failed",
        );
        expect(result.turn.assistant_message !== null).toBe(
          stage === "after_commit",
        );
        expect(await count("messages", result.turn.id)).toBe(
          stage === "after_commit" ? 2 : 1,
        );
        f.provider.done();
      } finally {
        await connection.close();
      }
    },
  );
  it("EC-DATA-03 acceptance rollback consumes no turn, sequence or capacity", async () => {
    const connection = new Database(config.databaseUrl, (stage, label) => {
      if (stage === "before_commit" && label === "accept")
        throw new Error("Known rollback");
    });
    try {
      const f = await setup(new ScriptedProvider([]), connection);
      await expect(
        f.service.submit(
          f.session.id,
          f.conversation.id,
          randomUUID(),
          "Rollback",
          f.network,
        ),
      ).rejects.toThrow();
      const c = await f.service.read(f.session.id, f.conversation.id);
      expect(c.turn_count).toBe(0);
      expect(c.revision).toBe(0);
      f.provider.done();
    } finally {
      await connection.close();
    }
  });
  it("EC-MODEL-17 review rejection stays hidden with known usage", async () => {
    const provider = new ScriptedProvider([
        allow(),
        answer(),
        {
          phase: "output_safety",
          result: fixtureResult({
            action: "reject",
            reason: "policy_violation",
          }),
        },
      ]),
      f = await setup(provider);
    const result = await f.service.submit(
      f.session.id,
      f.conversation.id,
      randomUUID(),
      "Review fixture",
      f.network,
    );
    expect(result.turn.failure?.code).toBe("OUTPUT_REJECTED");
    expect(result.turn.assistant_message).toBeNull();
    const calls = await rows(
      db.db,
      sql`select input_tokens,output_tokens,status from provider_calls where attempt_id=${result.operation.attempt_id}`,
      z.object({
        input_tokens: z.null(),
        output_tokens: z.null(),
        status: z.literal("succeeded"),
      }),
    );
    expect(calls).toHaveLength(3);
    provider.done();
  });
  it("EC-SEC-01/02 denies every cross-session operation", async () => {
    const a = await setup(),
      b = await setup(new ScriptedProvider([]));
    const completed = await a.service.submit(
      a.session.id,
      a.conversation.id,
      randomUUID(),
      "Private fixture",
      a.network,
    );
    await expect(
      a.service.read(b.session.id, a.conversation.id),
    ).rejects.toMatchObject({ code: "CONVERSATION_UNAVAILABLE" });
    await expect(
      a.service.submit(
        b.session.id,
        a.conversation.id,
        randomUUID(),
        "Other",
        b.network,
      ),
    ).rejects.toMatchObject({ code: "CONVERSATION_UNAVAILABLE" });
    await expect(
      a.service.retry(
        b.session.id,
        a.conversation.id,
        completed.turn.id,
        randomUUID(),
        completed.operation.attempt_id,
        b.network,
      ),
    ).rejects.toMatchObject({ code: "CONVERSATION_UNAVAILABLE" });
    a.provider.done();
    b.provider.done();
  });
  it("EC-DATA-01/04 runtime constraints reject mutation, deletion and cited content", async () => {
    const f = await setup(),
      result = await f.service.submit(
        f.session.id,
        f.conversation.id,
        randomUUID(),
        "Immutable",
        f.network,
      );
    await expect(
      db.db.execute(
        sql`update messages set content='{"answer":"Changed","claims":[]}'::jsonb where turn_id=${result.turn.id} and role='assistant'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.db.execute(sql`delete from messages where turn_id=${result.turn.id}`),
    ).rejects.toThrow();
    await expect(
      db.db.execute(
        sql`update conversations set session_id=${randomUUID()} where id=${f.conversation.id}`,
      ),
    ).rejects.toThrow();
    await expect(
      db.db.execute(sql`alter table messages disable trigger all`),
    ).rejects.toThrow();
    expect(
      (await f.service.read(f.session.id, f.conversation.id)).turns[0]
        ?.assistant_message?.content.answer,
    ).toBe("Synthetic saved response.");
    f.provider.done();
  });
  it("EC-SEC-04 EC-DATA-07 revocation races completion; cleanup is scoped/idempotent", async () => {
    const entered = gate<void>(),
      release = gate<ReturnType<typeof fixtureResult>>();
    const provider = new ScriptedProvider([
      allow(),
      {
        phase: "answer",
        result: () => {
          entered.resolve();
          return release.promise;
        },
      },
    ]);
    const a = await setup(provider),
      b = await setup();
    await b.service.submit(
      b.session.id,
      b.conversation.id,
      randomUUID(),
      "Keep me",
      b.network,
    );
    const pending = a.service.submit(
      a.session.id,
      a.conversation.id,
      randomUUID(),
      "Revoke me",
      a.network,
    );
    const expected = expect(pending).rejects.toMatchObject({
      code: "SESSION_UNAVAILABLE",
    });
    await entered.promise;
    await admin.db.execute(
      sql`update sessions set revoked_at=clock_timestamp() where id=${a.session.id}`,
    );
    release.resolve(
      fixtureResult({ answer: "Late private candidate", claims: [] }),
    );
    await expected;
    await maintenance(db, a.service, () => {});
    await maintenance(db, a.service, () => {});
    expect(
      (await b.service.read(b.session.id, b.conversation.id)).turn_count,
    ).toBe(1);
    const removed = await rows(
      admin.db,
      sql`select id from sessions where id=${a.session.id}`,
      z.object({ id: z.string() }),
    );
    expect(removed).toHaveLength(0);
    provider.done();
    b.provider.done();
  });
  it("EC-OPS-01/03 quota is durable and replay bypasses generation limits", async () => {
    const provider = new ScriptedProvider(
        Array.from({ length: 5 }, () => [allow(), answer(), review()]).flat(),
      ),
      f = await setup(provider);
    const keys = Array.from({ length: 5 }, () => randomUUID());
    for (const k of keys)
      await f.service.submit(
        f.session.id,
        f.conversation.id,
        k,
        "Quota",
        f.network,
      );
    await expect(
      f.service.submit(
        f.session.id,
        f.conversation.id,
        randomUUID(),
        "Sixth",
        f.network,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const replay = await f.service.submit(
      f.session.id,
      f.conversation.id,
      keys[0] ?? "",
      "Quota",
      f.network,
    );
    expect(replay.operation.replayed).toBe(true);
    expect(
      (await f.service.read(f.session.id, f.conversation.id)).turn_count,
    ).toBe(5);
    provider.done();
  });
  it("EC-CTX-10 full context bound rejects before provider without pruning", async () => {
    const f = await setup(new ScriptedProvider([]));
    const small = new TurnService(
      db,
      { ...config, contextMaxTokens: 50 },
      f.provider,
    );
    await expect(
      small.submit(
        f.session.id,
        f.conversation.id,
        randomUUID(),
        "Context budget",
        f.network,
      ),
    ).rejects.toMatchObject({ code: "CONVERSATION_LIMIT_REACHED" });
    expect(
      (await f.service.read(f.session.id, f.conversation.id)).turn_count,
    ).toBe(0);
    f.provider.done();
  });
});

describe("HTTP contract through the actual handler", () => {
  it("EC-OPS-05 HTTP 429 reports acceptance and retry time; replay stays read-only", async () => {
    const provider = new ScriptedProvider([
      {
        phase: "input_safety",
        result: new AppError(
          "PROVIDER_RATE_LIMITED",
          "accepted",
          "check_status",
          90,
        ),
      },
    ]);
    const handler = createHandler(
      db,
      config,
      new TurnService(db, config, provider),
      () => {},
    );
    let auth: Record<string, string> = {};
    const request = (path: string, body?: unknown) =>
      handler(
        new Request(`${config.origin}/api/v1/${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: config.origin,
            ...auth,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const boot = await request("session", {});
    const session = envelope(sessionSchema).parse(
      (await boot.json()) as unknown,
    );
    if (!("data" in session)) throw Error("Expected session");
    auth = {
      Cookie: boot.headers.get("set-cookie")?.split(";")[0] ?? "",
      "X-CSRF-Token": session.data.csrf_token,
    };
    const created = envelope(conversationSchema).parse(
      (await (
        await request("conversations", { client_conversation_id: randomUUID() })
      ).json()) as unknown,
    );
    if (!("data" in created)) throw Error("Expected conversation");
    const path = `conversations/${created.data.id}/turns`;
    const body = {
      client_submission_id: randomUUID(),
      question: "Synthetic HTTP quota",
    };
    const limited = await request(path, body);
    expect(limited.status).toBe(429);
    const error = envelope(operationSchema).parse(
      (await limited.json()) as unknown,
    );
    if (!("error" in error)) throw Error("Expected rate failure");
    expect(error.error).toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      operation_state: "accepted",
      recovery: { action: "check_status" },
    });
    expect(limited.headers.get("Retry-After")).toBe(
      String(error.error.recovery.retry_after_seconds),
    );
    const replay = await request(path, body);
    expect(replay.status).toBe(200);
    const saved = envelope(operationSchema).parse(
      (await replay.json()) as unknown,
    );
    if (!("data" in saved)) throw Error("Expected saved operation");
    expect(saved.data.operation.replayed).toBe(true);
    expect(saved.data.turn.failure?.retry_at).not.toBeNull();
    const retry = await request(`${path}/${saved.data.turn.id}/attempts`, {
      client_attempt_id: randomUUID(),
      failed_attempt_id: saved.data.turn.current_attempt.id,
    });
    expect(retry.status).toBe(429);
    const retryError = envelope(operationSchema).parse(
      (await retry.json()) as unknown,
    );
    expect("error" in retryError && retryError.error.operation_state).toBe(
      "not_accepted",
    );
    expect(provider.calls).toHaveLength(1);
  });
  it("EC-SEC-05/06 EC-INPUT-07 enforces Origin, CSRF, raw parsing, private envelopes and ownership", async () => {
    const provider = new ScriptedProvider([allow(), answer(), review()]),
      service = new TurnService(db, config, provider),
      handler = createHandler(db, config, service, () => {});
    const request = (
      path: string,
      method = "GET",
      body?: string,
      headers: Record<string, string> = {},
    ) =>
      handler(
        new Request(`${config.origin}/api/v1/${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            Origin: config.origin,
            ...headers,
          },
          ...(body === undefined ? {} : { body }),
        }),
      );
    expect(
      (
        await request("session", "POST", "{}", {
          Origin: "https://foreign.example",
        })
      ).status,
    ).toBe(403);
    const boot = await request("session", "POST", "{}"),
      s = envelope(sessionSchema).parse((await boot.json()) as unknown);
    if (!("data" in s)) throw new Error("Session failed");
    const cookie = boot.headers.get("set-cookie")?.split(";")[0] ?? "";
    const headers = { Cookie: cookie, "X-CSRF-Token": s.data.csrf_token };
    expect(
      (
        await request(
          "conversations",
          "POST",
          JSON.stringify({ client_conversation_id: randomUUID() }),
          { Cookie: cookie },
        )
      ).status,
    ).toBe(403);
    const created = await request(
        "conversations",
        "POST",
        JSON.stringify({ client_conversation_id: randomUUID() }),
        headers,
      ),
      c = envelope(conversationSchema).parse((await created.json()) as unknown);
    if (!("data" in c)) throw new Error("Create failed");
    expect(
      (
        await request(
          `conversations/${c.data.id}/turns`,
          "POST",
          `{"question":"A","question":"B","client_submission_id":"${randomUUID()}"}`,
          headers,
        )
      ).status,
    ).toBe(400);
    const key = randomUUID();
    const result = await request(
      `conversations/${c.data.id}/turns`,
      "POST",
      JSON.stringify({ question: "HTTP fixture", client_submission_id: key }),
      headers,
    );
    expect(result.status).toBe(201);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    const op = envelope(operationSchema).parse(
      (await result.json()) as unknown,
    );
    expect("data" in op).toBe(true);
    expect(result.headers.get("x-request-id")).toBe(op.meta.request_id);
    const lookup = await request(
      `conversations/${c.data.id}/submissions/${key}`,
      "GET",
      undefined,
      headers,
    );
    const recovered = envelope(lookupSchema).parse(
      (await lookup.json()) as unknown,
    );
    expect("data" in recovered && recovered.data.recorded).toBe(true);
    const missing = await request(
      `conversations/${c.data.id}/submissions/${randomUUID()}`,
      "GET",
      undefined,
      headers,
    );
    const absent = envelope(lookupSchema).parse(
      (await missing.json()) as unknown,
    );
    expect("data" in absent && absent.data.recorded).toBe(false);
    expect(
      (
        await request(
          `conversations/${c.data.id}?other=1`,
          "GET",
          undefined,
          headers,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("session", "PUT", "{}", headers)).headers.get("allow"),
    ).toBe("GET, POST");
    provider.done();
  });
});
