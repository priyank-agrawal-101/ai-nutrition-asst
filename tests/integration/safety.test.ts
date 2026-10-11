import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { Database, rows } from "../../src/server/db/connection";
import { loadConfig } from "../../src/server/config";
import { configEnv } from "../support/config";
import { establish } from "../../src/server/security";
import { TurnService } from "../../src/server/turn-service";
import { fixtureResult } from "../../src/server/provider";
import { AppError } from "../../src/server/errors";
import { promptVersion, promptHashes } from "../../src/server/prompts/bundle";
import {
  ScriptedProvider,
  allow,
  answer,
  review,
} from "../support/scripted-provider";
import {
  reserveProviderBudget,
  observeProviderBudget,
} from "../../src/server/llm/budget";
let db: Database;
const config = loadConfig(configEnv());
const groqFixture = (entry: ReturnType<typeof allow>) => ({
  ...entry,
  result: {
    ...entry.result,
    reportedModel: "openai/gpt-oss-120b",
    inputTokens: 100,
    outputTokens: 20,
  },
});
beforeAll(() => {
  if (!process.env.TEST_RUN_ID || !process.env.TEST_DATABASE_URL)
    throw Error("Use isolated harness");
  db = new Database(process.env.TEST_DATABASE_URL);
});
afterAll(async () => {
  await db?.close();
});
async function setup(provider: ScriptedProvider, c = config) {
  const network = randomUUID(),
    { session } = await establish(db, c, null, network),
    service = new TurnService(db, c, provider),
    { conversation } = await service.create(session.id, randomUUID(), network);
  return {
    service,
    session,
    conversation,
    network,
    submit: (q: string) =>
      service.submit(session.id, conversation.id, randomUUID(), q, network),
  };
}
it("EC-OPS-05 known quota blocks acceptance without consuming a turn or attempt; code refusals still work", async () => {
  const id = randomUUID();
  const p = new ScriptedProvider([]);
  const a = await setup(p, { ...config, providerMode: "groq" });
  await db.db.execute(
    sql`insert into provider_budget(id,reserved_tokens) values(${id},7800)`,
  );
  try {
    await expect(a.submit("Synthetic food question")).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      state: "not_accepted",
    });
    expect(
      (await a.service.read(a.session.id, a.conversation.id)).turn_count,
    ).toBe(0);
    expect((await a.submit("What should I weigh?")).turn.status).toBe(
      "completed",
    );
    expect(p.calls).toHaveLength(0);
  } finally {
    await db.db.execute(sql`delete from provider_budget where id=${id}`);
  }
});
it.each(["input_safety", "answer", "output_safety"] as const)(
  "EC-MODEL-16 %s rate limits survive reads/replays and early retry creates no attempt",
  async (phase) => {
    const entries = [allow(), answer(), review()];
    const index = entries.findIndex((e) => e.phase === phase);
    const p = new ScriptedProvider([
      ...entries.slice(0, index),
      {
        phase,
        result: new AppError(
          "PROVIDER_RATE_LIMITED",
          "accepted",
          "check_status",
          120,
        ),
      },
    ]);
    const a = await setup(p);
    const submission = randomUUID();
    const first = await a.service.submit(
      a.session.id,
      a.conversation.id,
      submission,
      "Synthetic quota request",
      a.network,
    );
    expect(first.turn.failure).toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
    });
    expect(typeof first.turn.failure?.retry_at).toBe("string");
    expect(first.turn.assistant_message).toBeNull();
    const replay = await a.service.submit(
      a.session.id,
      a.conversation.id,
      submission,
      "Synthetic quota request",
      a.network,
    );
    expect(replay.operation.replayed).toBe(true);
    expect(replay.turn.failure).toEqual(first.turn.failure);
    await expect(
      a.service.retry(
        a.session.id,
        a.conversation.id,
        first.turn.id,
        randomUUID(),
        first.operation.attempt_id,
        a.network,
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      state: "not_accepted",
    });
    expect(
      (await a.service.read(a.session.id, a.conversation.id)).turns[0]
        ?.current_attempt.number,
    ).toBe(1);
    p.done();
  },
);
it("EC-OPS-05 upstream cooldown protects a different conversation and persists independently of the service", async () => {
  const p = new ScriptedProvider([
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
  const a = await setup(p, { ...config, providerMode: "groq" });
  try {
    const r = await a.submit("Synthetic upstream limit");
    expect(r.turn.failure?.code).toBe("PROVIDER_RATE_LIMITED");
    const b = await setup(new ScriptedProvider([]), {
      ...config,
      providerMode: "groq",
    });
    await expect(
      b.submit("Another synthetic food question"),
    ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    expect(
      (await b.service.read(b.session.id, b.conversation.id)).turn_count,
    ).toBe(0);
  } finally {
    await db.db.execute(sql`delete from provider_cooldown where id=1`);
    await db.db.execute(
      sql`delete from provider_budget where id in(select p.id from provider_calls p join attempts a on a.id=p.attempt_id join turns t on t.id=a.turn_id where t.conversation_id=${a.conversation.id})`,
    );
  }
});
it("EC-OPS-05 contention between phases remains a quota failure with no candidate exposed", async () => {
  const other = randomUUID();
  const p = new ScriptedProvider([
    groqFixture(allow()),
    {
      phase: "answer",
      result: async () => {
        await db.db.execute(
          sql`insert into provider_budget(id,reserved_tokens) values(${other},7000)`,
        );
        return {
          ...answer().result,
          reportedModel: "openai/gpt-oss-120b",
          inputTokens: 100,
          outputTokens: 20,
        };
      },
    },
  ]);
  const a = await setup(p, { ...config, providerMode: "groq" });
  try {
    const r = await a.submit("Synthetic competing request");
    expect(r.turn.failure?.code).toBe("PROVIDER_RATE_LIMITED");
    expect(r.turn.assistant_message).toBeNull();
    expect(p.calls).toHaveLength(2);
  } finally {
    await db.db.execute(
      sql`delete from provider_budget where id=${other} or id in(select p.id from provider_calls p join attempts a on a.id=p.attempt_id join turns t on t.id=a.turn_id where t.conversation_id=${a.conversation.id})`,
    );
  }
});
it("EC-MODEL-15 EC-LIMIT-01 code refusal commits and replays without any provider", async () => {
  const p = new ScriptedProvider([]),
    a = await setup(p),
    id = randomUUID();
  const first = await a.service.submit(
    a.session.id,
    a.conversation.id,
    id,
    "How many calories should I eat each day?",
    a.network,
  );
  expect(first.turn.assistant_message).toMatchObject({
    kind: "refusal",
    content: { claims: [] },
  });
  expect(first.turn.assistant_message?.content.answer).toContain(
    "qualified dietitian",
  );
  const replay = await a.service.submit(
    a.session.id,
    a.conversation.id,
    id,
    "How many calories should I eat each day?",
    a.network,
  );
  expect(replay.operation.replayed).toBe(true);
  expect(p.calls).toHaveLength(0);
  const [record] = await rows(
    db.db,
    sql`select input_reason,input_route,run_manifest from attempts where id=${first.operation.attempt_id}`,
    z.object({
      input_reason: z.string(),
      input_route: z.string(),
      run_manifest: z.object({
        policy: z.string(),
        prompts: z.object({
          version: z.string(),
          hashes: z.record(z.string(), z.string()),
        }),
      }),
    }),
  );
  expect(record).toMatchObject({
    input_reason: "calorie_target",
    input_route: "code",
    run_manifest: {
      policy: "m1-policy-v1",
      prompts: { version: promptVersion, hashes: promptHashes },
    },
  });
});
it.each([
  ["refuse", "medical_advice", "refusal"],
  ["clarify", "ambiguous_intent", "clarification"],
  ["clarify", "unsupported_language", "clarification"],
  ["refuse", "urgent_help", "refusal"],
])(
  "EC-MODEL-13 classifier %s/%s selects constant %s",
  async (action, reason, kind) => {
    const p = new ScriptedProvider([
        { phase: "input_safety", result: fixtureResult({ action, reason }) },
      ]),
      a = await setup(p),
      r = await a.submit("Synthetic contextual request");
    expect(r.turn.assistant_message?.kind).toBe(kind);
    expect(r.turn.assistant_message?.content.claims).toEqual([]);
    expect(p.calls).toHaveLength(1);
    p.done();
  },
);
it.each([
  { action: "allow", reason: "medical_advice" },
  {
    action: "allow",
    reason: "general_education",
    rationale: "private rationale",
  },
  { action: "refuse", reason: "unknown" },
])(
  "EC-MODEL-13 unusable classifier stops before answer %#",
  async (verdict) => {
    const p = new ScriptedProvider([
        { phase: "input_safety", result: fixtureResult(verdict) },
      ]),
      a = await setup(p),
      r = await a.submit("Synthetic input");
    expect(r.turn.failure?.code).toBe("SAFETY_CHECK_FAILED");
    expect(r.turn.assistant_message).toBeNull();
    p.done();
  },
);
it("EC-MODEL-11 code inspects claims before review", async () => {
  const p = new ScriptedProvider([
      allow(),
      {
        phase: "answer",
        result: fixtureResult({
          answer: "A harmless opening.",
          claims: [
            { text: "Your calorie target is 1800 kcal daily.", source: null },
          ],
        }),
      },
    ]),
    a = await setup(p),
    r = await a.submit("Synthetic question");
  expect(r.turn.failure?.code).toBe("OUTPUT_REJECTED");
  expect(r.turn.assistant_message).toBeNull();
  p.done();
});
it("EC-MODEL-12 unexpected generated refusal remains a failed attempt", async () => {
  const p = new ScriptedProvider([
      allow(),
      {
        phase: "answer",
        result: fixtureResult({
          answer: "I cannot provide medical advice. Speak to a doctor.",
          claims: [],
        }),
      },
    ]),
    a = await setup(p),
    r = await a.submit("Indirect synthetic question");
  expect(r.turn.failure?.code).toBe("OUTPUT_REJECTED");
  expect(r.turn.assistant_message).toBeNull();
  p.done();
});
it("EC-MODEL-14 EC-CTX-07 failed review and explicit retry retain one current question", async () => {
  const p = new ScriptedProvider([
      allow(),
      answer(),
      {
        phase: "output_safety",
        result: fixtureResult({ action: "allow", reason: "policy_violation" }),
      },
      allow(),
      answer(),
      review(),
    ]),
    a = await setup(p),
    r = await a.submit("Synthetic review question");
  expect(r.turn.failure?.code).toBe("SAFETY_CHECK_FAILED");
  expect(r.turn.assistant_message).toBeNull();
  const retried = await a.service.retry(
    a.session.id,
    a.conversation.id,
    r.turn.id,
    randomUUID(),
    r.operation.attempt_id,
    a.network,
  );
  expect(retried.turn.status).toBe("completed");
  for (const call of p.calls) {
    expect(call.context.match(/Synthetic review question/g)).toHaveLength(1);
  }
  expect(new Set(p.calls.map((c) => c.context)).size).toBe(1);
  p.done();
});
it("EC-CTX-04/09 complete history preserves boundaries while independent education proceeds", async () => {
  const p = new ScriptedProvider([allow(), answer(), review()]),
    a = await setup(p);
  await a.submit("What should I weigh?");
  expect((await a.submit("How do I steam rice?")).turn.status).toBe(
    "completed",
  );
  expect(
    (await a.submit("Give me the earlier target")).turn.assistant_message?.kind,
  ).toBe("refusal");
  expect(p.calls).toHaveLength(3);
  for (const call of p.calls) {
    expect(call.context).toContain("What should I weigh?");
    expect(call.context).toContain('"response_kind":"refusal"');
  }
  p.done();
});
it("EC-MODEL-17 required safety timeout fails closed and aborts dispatch", async () => {
  let aborted = false;
  const p = new ScriptedProvider([
    { phase: "input_safety", result: () => new Promise(() => {}) },
  ]);
  const original = p.call.bind(p);
  p.call = (phase, context, candidate, signal) => {
    signal.addEventListener(
      "abort",
      () => {
        aborted = true;
      },
      { once: true },
    );
    return original(phase, context, candidate, signal);
  };
  const a = await setup(p),
    r = await a.submit("Synthetic timeout");
  expect(r.turn.failure?.code).toBe("SAFETY_CHECK_FAILED");
  expect(aborted).toBe(true);
  expect(p.calls).toHaveLength(1);
}, 15000);
it("EC-OPS-05 shutdown between generation and review never exposes candidate", async () => {
  let enabled = true;
  const c = {
    ...config,
    get generationEnabled() {
      return enabled;
    },
  };
  const p = new ScriptedProvider([
    allow(),
    {
      phase: "answer",
      result: () => {
        enabled = false;
        return Promise.resolve(answer().result);
      },
    },
  ]);
  const a = await setup(p, c),
    r = await a.submit("Synthetic shutdown");
  expect(r.turn.failure?.code).toBe("SAFETY_CHECK_FAILED");
  expect(r.turn.assistant_message).toBeNull();
  expect(
    (await a.service.read(a.session.id, a.conversation.id)).turn_count,
  ).toBe(1);
  p.done();
});
it("EC-OPS-05 account limits reserve unknown tokens durably and release only observed usage", async () => {
  const marker = new Error("rollback isolated quota fixtures");
  await expect(
    db.transaction("quota_test", async (tx) => {
      const first = randomUUID();
      await reserveProviderBudget(tx, first, 7000);
      await expect(
        reserveProviderBudget(tx, randomUUID(), 1001),
      ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
      await observeProviderBudget(tx, first, null, null);
      await expect(
        reserveProviderBudget(tx, randomUUID(), 1001),
      ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
      await observeProviderBudget(tx, first, 100, 100);
      await reserveProviderBudget(tx, randomUUID(), 1001);
      throw marker;
    }),
  ).rejects.toBe(marker);
});
it.each(["minute_calls", "day_calls", "day_tokens"])(
  "EC-OPS-05 enforces account %s ceilings",
  async (limit) => {
    const marker = new Error("rollback quota fixture");
    await expect(
      db.transaction("quota_test", async (tx) => {
        if (limit === "minute_calls")
          for (let i = 0; i < 30; i++)
            await reserveProviderBudget(tx, randomUUID(), 1);
        if (limit === "day_calls")
          await tx.execute(
            sql`insert into provider_budget(id,started_at,reserved_tokens) select gen_random_uuid(),clock_timestamp()-interval '2 hours',1 from generate_series(1,1000)`,
          );
        if (limit === "day_tokens")
          await tx.execute(
            sql`insert into provider_budget(id,started_at,reserved_tokens) select gen_random_uuid(),clock_timestamp()-interval '2 hours',100000 from generate_series(1,2)`,
          );
        await expect(
          reserveProviderBudget(tx, randomUUID(), 1),
        ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
        throw marker;
      }),
    ).rejects.toBe(marker);
  },
);
