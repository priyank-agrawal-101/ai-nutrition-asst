import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { Database, rows } from "../../src/server/db/connection";
import { loadConfig, type Config } from "../../src/server/config";
import { configEnv } from "../support/config";
import { establish } from "../../src/server/security";
import { TurnService } from "../../src/server/turn-service";
import { maintenance } from "../../src/server/maintenance";
import { fixtureResult } from "../../src/server/provider";
import {
  ScriptedProvider,
  allow,
  answer,
  review,
} from "../support/scripted-provider";
let db: Database;
const base = loadConfig(configEnv());
// Explicit synthetic capture fixture; never loads the local app's marker/key/database.
const capture = {
  ...base,
  environment: "local" as const,
  diagnosticsEnabled: true,
};
beforeAll(() => {
  if (!process.env.TEST_RUN_ID || !process.env.TEST_DATABASE_URL)
    throw Error("Use isolated harness");
  db = new Database(process.env.TEST_DATABASE_URL);
});
afterAll(async () => {
  await db.close();
});
const reject = () => ({
  phase: "output_safety" as const,
  result: fixtureResult({ action: "reject", reason: "policy_violation" }),
});
async function setup(
  provider = new ScriptedProvider([allow(), answer(), reject()]),
  config: Config = capture,
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
  const result = await service.submit(
    session.id,
    conversation.id,
    randomUUID(),
    "Synthetic diagnostic question",
    network,
  );
  return { provider, session, service, conversation, result };
}
async function diagnostic(attempt: string) {
  return rows(
    db.db,
    sql`select reason,payload,extract(epoch from(expires_at-captured_at))::float8 as lifetime from model_diagnostics where attempt_id=${attempt}`,
    z.object({
      reason: z.string(),
      payload: z.record(
        z.string(),
        z.object({
          text: z.string(),
          complete: z.boolean(),
          truncated: z.boolean(),
          redacted: z.boolean(),
        }),
      ),
      lifetime: z.number(),
    }),
  );
}
it("EC-MODEL-14 output rejection captures candidate and verdict privately; replay/context exclude it", async () => {
  const a = await setup();
  expect(a.result.turn.failure?.code).toBe("OUTPUT_REJECTED");
  expect(a.result.turn.assistant_message).toBeNull();
  const [row] = await diagnostic(a.result.operation.attempt_id);
  expect(row?.reason).toBe("OUTPUT_REJECTED");
  expect(row?.payload.answer?.text).toContain("Synthetic saved response.");
  expect(row?.payload.output_safety?.text).toContain("policy_violation");
  expect(row?.lifetime).toBeGreaterThan(0);
  expect(row?.lifetime).toBeLessThanOrEqual(86401);
  expect(
    JSON.stringify(await a.service.read(a.session.id, a.conversation.id)),
  ).not.toContain("Synthetic saved response.");
  const follow = new ScriptedProvider([allow(), answer(), review()]);
  const service = new TurnService(db, capture, follow);
  await service.submit(
    a.session.id,
    a.conversation.id,
    randomUUID(),
    "Independent synthetic follow-up",
    randomUUID(),
  );
  expect(follow.calls[0]?.context).not.toContain("Synthetic saved response.");
  expect(await diagnostic(a.result.operation.attempt_id)).toHaveLength(1);
});
it("EC-MODEL-13 input refusal records classification with no invented answer", async () => {
  const a = await setup(
    new ScriptedProvider([
      {
        phase: "input_safety",
        result: fixtureResult({ action: "refuse", reason: "medical_advice" }),
      },
    ]),
  );
  const [row] = await diagnostic(a.result.operation.attempt_id);
  expect(row?.reason).toBe("INPUT_BOUNDARY");
  expect(row?.payload.input_safety?.text).toContain("medical_advice");
  expect(row?.payload.answer).toBeUndefined();
  expect(a.result.turn.status).toBe("completed");
});
it("EC-MODEL-06 malformed answer capture is bounded, redacted and still fails validation", async () => {
  const a = await setup(
    new ScriptedProvider([
      allow(),
      {
        phase: "answer",
        result: {
          raw: Buffer.from("not JSON\0 gsk_abcdefghijklmnopqrstuvwxyz"),
          complete: true,
          inputTokens: null,
          outputTokens: null,
        },
      },
    ]),
  );
  expect(a.result.turn.failure?.code).toBe("OUTPUT_INVALID");
  const [row] = await diagnostic(a.result.operation.attempt_id);
  expect(row?.payload.answer?.redacted).toBe(true);
  expect(row?.payload.answer?.text).not.toContain("gsk_");
});
it("EC-SEC-11 successful answers and ordinary tests do not create diagnostic copies", async () => {
  const success = await setup(
    new ScriptedProvider([allow(), answer(), review()]),
  );
  expect(await diagnostic(success.result.operation.attempt_id)).toHaveLength(0);
  const off = await setup(undefined, {
    ...capture,
    environment: "test",
    diagnosticsEnabled: true,
  });
  expect(await diagnostic(off.result.operation.attempt_id)).toHaveLength(0);
});
it("EC-DATA-06/07 diagnostic expiry and session revocation purge only affected captures", async () => {
  const expired = await setup(),
    revoked = await setup(),
    retained = await setup();
  await db.db.execute(
    sql`update model_diagnostics set captured_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '1 hour' where attempt_id=${expired.result.operation.attempt_id}`,
  );
  await db.db.execute(
    sql`update sessions set revoked_at=clock_timestamp() where id=${revoked.session.id}`,
  );
  await maintenance(db, retained.service, () => {});
  expect(await diagnostic(expired.result.operation.attempt_id)).toHaveLength(0);
  expect(await diagnostic(revoked.result.operation.attempt_id)).toHaveLength(0);
  expect(await diagnostic(retained.result.operation.attempt_id)).toHaveLength(
    1,
  );
});
it("EC-DATA-04 diagnostic storage failure never changes committed failure or triggers another call", async () => {
  const faulty = new Database(
    process.env.TEST_DATABASE_URL!,
    (stage, label) => {
      if (stage === "before_work" && label === "diagnostic_capture")
        throw Error("synthetic diagnostic storage outage");
    },
  );
  try {
    const a = await setup(undefined, capture, faulty);
    expect(a.result.turn.failure?.code).toBe("OUTPUT_REJECTED");
    expect(a.provider.calls).toHaveLength(3);
    expect(await diagnostic(a.result.operation.attempt_id)).toHaveLength(0);
  } finally {
    await faulty.close();
  }
});
