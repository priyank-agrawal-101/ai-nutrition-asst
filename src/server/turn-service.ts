import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  normalize,
  m1AnswerSchema,
  type AnswerContent,
  type FailureCode,
  type TurnView,
  type ConversationView,
} from "@/contracts/api";
import type { Config } from "./config";
import {
  type Database,
  type Db,
  rows,
  databaseTime,
  dateValue,
} from "./db/connection";
import { lockConversation, snapshot } from "./db/conversations";
import { digest, lockSession } from "./security";
import { buildContext } from "./context";
import { charge } from "./quotas";
import { AppError, safeMessage } from "./errors";
import { parseRawJson } from "./validation/json";
import {
  inputVerdict,
  outputVerdict,
  type Provider,
  type Phase,
  type ProviderResult,
} from "./provider";
import { retrieve } from "./retrieval";

type Accepted = {
  turnId: string;
  attemptId: string;
  replayed: boolean;
  context: string;
  deadline: string;
};
const receiptRow = z.object({
  id: z.string(),
  normalized_question: z.string(),
  current_attempt_id: z.string(),
});
const attemptRow = z.object({
  id: z.string(),
  retries_attempt_id: z.string().nullable(),
  deadline_at: dateValue,
  context_digest: z.instanceof(Buffer),
});
export class TurnService {
  constructor(
    readonly database: Database,
    readonly config: Config,
    private readonly provider: Provider,
  ) {}
  async read(
    sessionId: string,
    conversationId: string,
  ): Promise<ConversationView> {
    return this.database.transaction("read", async (db) => {
      await lockConversation(db, sessionId, conversationId);
      await this.reconcileLocked(db, conversationId);
      return snapshot(db, sessionId, conversationId);
    });
  }
  async create(
    sessionId: string,
    operationId: string,
    network: string,
  ): Promise<{ conversation: ConversationView; replayed: boolean }> {
    const id = randomUUID();
    const result = await this.database.transaction("create", async (db) => {
      // Exclusive session lock serializes creation keys without a separate lock service.
      await db.execute(
        sql`select id from sessions where id=${sessionId} for update`,
      );
      await lockSession(db, sessionId);
      const [old] = await rows(
        db,
        sql`select id from conversations where session_id=${sessionId} and client_conversation_id=${operationId}`,
        z.object({ id: z.string() }),
      );
      if (old) return { id: old.id, replayed: true };
      await charge(db, this.config, "conversation", sessionId, network);
      await db.execute(
        sql`insert into conversations(id,session_id,client_conversation_id) values(${id},${sessionId},${operationId})`,
      );
      return { id, replayed: false };
    });
    return {
      conversation: await this.read(sessionId, result.id),
      replayed: result.replayed,
    };
  }
  async submit(
    sessionId: string,
    conversationId: string,
    submissionId: string,
    rawQuestion: string,
    network: string,
  ) {
    const question = normalize(rawQuestion);
    const initial = await this.read(sessionId, conversationId);
    // Receipt precedes limits: a valid replay remains available after history fills or shutdown.
    const old = initial.turns.find(
      (t) => t.client_submission_id === submissionId,
    );
    if (old)
      return this.replaySubmit(
        sessionId,
        conversationId,
        submissionId,
        question,
      );
    let context: ReturnType<typeof buildContext>;
    for (let rebuild = 0; rebuild < 3; rebuild++) {
      const observed =
        rebuild === 0 ? initial : await this.read(sessionId, conversationId);
      if (observed.turns.some((t) => t.client_submission_id === submissionId))
        return this.replaySubmit(
          sessionId,
          conversationId,
          submissionId,
          question,
        );
      context = buildContext(
        observed,
        question,
        observed.turn_count + 1,
        this.config.contextMaxTokens,
      );
      const accepted = await this.database.transaction("accept", async (db) => {
        await lockConversation(db, sessionId, conversationId);
        await this.reconcileLocked(db, conversationId);
        const [receipt] = await rows(
          db,
          sql`select id,normalized_question,current_attempt_id from turns where conversation_id=${conversationId} and client_submission_id=${submissionId}`,
          receiptRow,
        );
        if (receipt) {
          if (receipt.normalized_question !== question)
            throw new AppError("IDEMPOTENCY_CONFLICT");
          return this.initialReceipt(db, receipt.id);
        }
        const current = await snapshot(db, sessionId, conversationId);
        if (current.revision !== observed.revision) return null;
        if (current.active_turn_id) throw new AppError("CONVERSATION_BUSY");
        if (!this.config.generationEnabled)
          throw new AppError("GENERATION_UNAVAILABLE");
        const turnId = randomUUID(),
          attemptId = randomUUID(),
          now = await databaseTime(db),
          deadline = new Date(
            now.getTime() + this.config.limits.attempt_timeout_seconds * 1000,
          ),
          sequence = current.turn_count + 1;
        await charge(db, this.config, "generation", sessionId, network);
        await this.claimSlot(db, attemptId, deadline);
        await db.execute(
          sql`insert into turns(id,conversation_id,client_submission_id,sequence,normalized_question,question_digest,normalization_version,status,current_attempt_id,created_at,updated_at) values(${turnId},${conversationId},${submissionId},${sequence},${question},${digest(question)},'v1','running',${attemptId},${now},${now})`,
        );
        await db.execute(
          sql`insert into messages(id,turn_id,role,user_text,created_at) values(${randomUUID()},${turnId},'user',${rawQuestion},${now})`,
        );
        await this.insertAttempt(db, {
          turnId,
          attemptId,
          number: 1,
          clientId: null,
          failedId: null,
          now,
          deadline,
          revision: current.revision,
          sequence,
          contextDigest: context.digest,
        });
        await this.advance(db, conversationId);
        return {
          turnId,
          attemptId,
          replayed: false,
          context: context.canonical,
          deadline: deadline.toISOString(),
        };
      });
      if (accepted)
        return this.finishOperation(sessionId, conversationId, accepted);
    }
    throw new AppError("CONVERSATION_BUSY");
  }
  private async replaySubmit(
    sessionId: string,
    conversationId: string,
    submissionId: string,
    question: string,
  ) {
    const accepted = await this.database.transaction("replay", async (db) => {
      await lockConversation(db, sessionId, conversationId);
      const [t] = await rows(
        db,
        sql`select id,normalized_question,current_attempt_id from turns where conversation_id=${conversationId} and client_submission_id=${submissionId}`,
        receiptRow,
      );
      if (!t || t.normalized_question !== question)
        throw new AppError("IDEMPOTENCY_CONFLICT");
      return this.initialReceipt(db, t.id);
    });
    return this.finishOperation(sessionId, conversationId, accepted);
  }
  private async initialReceipt(db: Db, turnId: string): Promise<Accepted> {
    const [a] = await rows(
      db,
      sql`select id,retries_attempt_id,deadline_at,context_digest from attempts where turn_id=${turnId} and number=1`,
      attemptRow,
    );
    if (!a) throw new Error("Missing initial receipt");
    return {
      turnId,
      attemptId: a.id,
      replayed: true,
      context: "",
      deadline: a.deadline_at,
    };
  }
  async retry(
    sessionId: string,
    conversationId: string,
    turnId: string,
    clientId: string,
    failedId: string,
    network: string,
  ) {
    const observed = await this.read(sessionId, conversationId),
      turn = observed.turns.find((t) => t.id === turnId);
    if (!turn) throw new AppError("TURN_UNAVAILABLE");
    const context = buildContext(
      observed,
      normalize(turn.user_message.text),
      turn.sequence,
      this.config.contextMaxTokens,
    );
    const accepted = await this.database.transaction("retry", async (db) => {
      await lockConversation(db, sessionId, conversationId);
      await this.reconcileLocked(db, conversationId);
      const [receipt] = await rows(
        db,
        sql`select id,retries_attempt_id,deadline_at,context_digest from attempts where turn_id=${turnId} and client_attempt_id=${clientId}`,
        attemptRow,
      );
      if (receipt) {
        if (receipt.retries_attempt_id !== failedId)
          throw new AppError("IDEMPOTENCY_CONFLICT");
        return {
          turnId,
          attemptId: receipt.id,
          replayed: true,
          context: "",
          deadline: receipt.deadline_at,
        };
      }
      const current = await snapshot(db, sessionId, conversationId),
        t = current.turns.find((t) => t.id === turnId);
      if (!t) throw new AppError("TURN_UNAVAILABLE");
      if (t.status === "running") throw new AppError("TURN_ACTIVE");
      if (!t.retry.allowed) throw new AppError("RETRY_NOT_ALLOWED");
      if (t.current_attempt.id !== failedId)
        throw new AppError("STALE_ATTEMPT");
      if (!this.config.generationEnabled)
        throw new AppError("GENERATION_UNAVAILABLE");
      const now = await databaseTime(db),
        deadline = new Date(
          now.getTime() + this.config.limits.attempt_timeout_seconds * 1000,
        ),
        attemptId = randomUUID();
      await charge(db, this.config, "generation", sessionId, network);
      await this.claimSlot(db, attemptId, deadline);
      await this.insertAttempt(db, {
        turnId,
        attemptId,
        number: t.current_attempt.number + 1,
        clientId,
        failedId,
        now,
        deadline,
        revision: current.revision,
        sequence: t.sequence,
        contextDigest: context.digest,
      });
      await db.execute(
        sql`update turns set status='running',current_attempt_id=${attemptId},updated_at=${now} where id=${turnId}`,
      );
      await this.advance(db, conversationId);
      return {
        turnId,
        attemptId,
        replayed: false,
        context: context.canonical,
        deadline: deadline.toISOString(),
      };
    });
    return this.finishOperation(sessionId, conversationId, accepted);
  }
  private async insertAttempt(
    db: Db,
    a: {
      turnId: string;
      attemptId: string;
      number: number;
      clientId: string | null;
      failedId: string | null;
      now: Date;
      deadline: Date;
      revision: number;
      sequence: number;
      contextDigest: Buffer;
    },
  ): Promise<void> {
    const manifest = {
      application: this.config.buildId,
      prompts: { input_safety: null, answer: null, output_safety: null },
      schema: "v1",
      policy: "phase1-scripted-only",
      context_builder: "v1",
      normalization: "v1",
      limits: {
        ...this.config.limits,
        context_tokens: this.config.contextMaxTokens,
        phase_ms: { input_safety: 10000, answer: 25000, output_safety: 10000 },
        shared_ms: 45000,
        output_tokens: 2000,
        verdict_tokens: 256,
      },
      provider: {
        name: "scripted",
        model: "fixture-v1",
        temperature: null,
        seed: null,
      },
      usage: "v1",
    };
    await db.execute(
      sql`insert into attempts(id,turn_id,number,client_attempt_id,retries_attempt_id,status,started_at,deadline_at,context_revision,context_through_sequence,context_digest,milestone,run_manifest) values(${a.attemptId},${a.turnId},${a.number},${a.clientId},${a.failedId},'running',${a.now},${a.deadline},${a.revision},${a.sequence},${a.contextDigest},1,${JSON.stringify(manifest)}::jsonb)`,
    );
  }
  private async claimSlot(
    db: Db,
    attemptId: string,
    deadline: Date,
  ): Promise<void> {
    const [slot] = await rows(
      db,
      sql`with free as (select slot_number from generation_slots where attempt_id is null or leased_until<=clock_timestamp() order by slot_number for update skip locked limit 1) update generation_slots g set attempt_id=${attemptId},leased_until=${deadline} from free where g.slot_number=free.slot_number returning g.slot_number`,
      z.object({ slot_number: z.number() }),
    );
    if (!slot) throw new AppError("GENERATION_UNAVAILABLE");
  }
  private async advance(db: Db, conversationId: string): Promise<void> {
    await db.execute(
      sql`update conversations set revision=revision+1,updated_at=clock_timestamp() where id=${conversationId}`,
    );
  }
  async reconcileLocked(db: Db, conversationId: string): Promise<number> {
    const expired = await rows(
      db,
      sql`select t.id,a.id as attempt_id from turns t join attempts a on a.id=t.current_attempt_id where t.conversation_id=${conversationId} and t.status='running' and a.deadline_at<=clock_timestamp()`,
      z.object({ id: z.string(), attempt_id: z.string() }),
    );
    for (const t of expired)
      await this.failLocked(
        db,
        conversationId,
        t.id,
        t.attempt_id,
        "ATTEMPT_TIMEOUT",
      );
    return expired.length;
  }
  private async failLocked(
    db: Db,
    conversationId: string,
    turnId: string,
    attemptId: string,
    code: FailureCode,
  ): Promise<void> {
    const result = await rows(
      db,
      sql`update attempts set status='failed',failure_code=${code},failure_message=${safeMessage(code)},finished_at=clock_timestamp() where id=${attemptId} and status='running' and exists(select 1 from turns where id=${turnId} and current_attempt_id=${attemptId} and status='running') returning id`,
      z.object({ id: z.string() }),
    );
    if (!result.length) return;
    await db.execute(
      sql`update turns set status='failed',updated_at=clock_timestamp() where id=${turnId}`,
    );
    await db.execute(
      sql`update provider_calls set status='unknown',ended_at=clock_timestamp(),error_code='OBSERVATION_ENDED' where attempt_id=${attemptId} and status='started'`,
    );
    await db.execute(
      sql`update generation_slots set attempt_id=null,leased_until=null where attempt_id=${attemptId}`,
    );
    await this.advance(db, conversationId);
  }
  private async finishOperation(
    sessionId: string,
    conversationId: string,
    a: Accepted,
  ): Promise<{
    turn: TurnView;
    operation: { attempt_id: string; replayed: boolean };
  }> {
    if (!a.replayed) await this.execute(sessionId, conversationId, a);
    const c = await this.read(sessionId, conversationId),
      turn = c.turns.find((t) => t.id === a.turnId);
    if (!turn) throw new AppError("TURN_UNAVAILABLE");
    return {
      turn,
      operation: { attempt_id: a.attemptId, replayed: a.replayed },
    };
  }
  private async execute(
    sessionId: string,
    conversationId: string,
    a: Accepted,
  ): Promise<void> {
    const started = Date.now();
    try {
      const c = await this.read(sessionId, conversationId),
        t = c.turns.find((t) => t.id === a.turnId);
      if (!t) throw new AppError("TURN_UNAVAILABLE");
      const rebuilt = buildContext(
        c,
        normalize(t.user_message.text),
        t.sequence,
        this.config.contextMaxTokens,
      );
      const [stored] = await rows(
        this.database.db,
        sql`select id,retries_attempt_id,deadline_at,context_digest from attempts where id=${a.attemptId} and turn_id=${a.turnId}`,
        attemptRow,
      );
      if (
        !stored ||
        !stored.context_digest.equals(rebuilt.digest) ||
        rebuilt.canonical !== a.context
      )
        throw new AppError("ATTEMPT_FAILED");
      const input = await this.call(
        sessionId,
        conversationId,
        a,
        "input_safety",
        null,
        started,
      );
      if (!inputVerdict.safeParse(input).success)
        throw new AppError("SAFETY_CHECK_FAILED");
      retrieve();
      const candidate = m1AnswerSchema.safeParse(
        await this.call(sessionId, conversationId, a, "answer", null, started),
      );
      if (!candidate.success) throw new AppError("OUTPUT_INVALID");
      const review = outputVerdict.safeParse(
        await this.call(
          sessionId,
          conversationId,
          a,
          "output_safety",
          JSON.stringify(candidate.data),
          started,
        ),
      );
      if (!review.success) throw new AppError("SAFETY_CHECK_FAILED");
      if (review.data.verdict !== "accept")
        throw new AppError("OUTPUT_REJECTED");
      await this.complete(sessionId, conversationId, a, candidate.data);
    } catch (error) {
      if (
        error instanceof AppError &&
        ["SESSION_UNAVAILABLE", "CONVERSATION_UNAVAILABLE"].includes(error.code)
      )
        throw error;
      // Read after any completion uncertainty before attempting a terminal failure.
      try {
        await this.database.transaction("failure", async (db) => {
          await lockConversation(db, sessionId, conversationId);
          await this.reconcileLocked(db, conversationId);
          const code: FailureCode =
            error instanceof AppError &&
            [
              "OUTPUT_INVALID",
              "OUTPUT_REJECTED",
              "SAFETY_CHECK_FAILED",
              "ATTEMPT_TIMEOUT",
              "MODEL_SERVICE_FAILED",
              "ATTEMPT_FAILED",
            ].includes(error.code)
              ? z
                  .enum([
                    "OUTPUT_INVALID",
                    "OUTPUT_REJECTED",
                    "SAFETY_CHECK_FAILED",
                    "ATTEMPT_TIMEOUT",
                    "MODEL_SERVICE_FAILED",
                    "ATTEMPT_FAILED",
                  ])
                  .parse(error.code)
              : "STORAGE_FAILED";
          await this.failLocked(
            db,
            conversationId,
            a.turnId,
            a.attemptId,
            code,
          );
        });
      } catch (failure) {
        if (failure instanceof AppError) throw failure;
        throw new AppError("STORAGE_UNAVAILABLE", "unknown", "check_status");
      }
    }
  }
  private async call(
    sessionId: string,
    conversationId: string,
    a: Accepted,
    phase: Phase,
    candidate: string | null,
    started: number,
  ): Promise<unknown> {
    if (!this.config.generationEnabled)
      throw new AppError("MODEL_SERVICE_FAILED");
    const remaining = Math.min(
      45000 - (Date.now() - started),
      new Date(a.deadline).getTime() - Date.now(),
      phase === "answer" ? 25000 : 10000,
    );
    if (remaining <= 0) throw new AppError("ATTEMPT_TIMEOUT");
    const id = randomUUID();
    await this.database.transaction("call_intent", async (db) => {
      await lockConversation(db, sessionId, conversationId);
      const [live] = await rows(
        db,
        sql`select id from attempts where id=${a.attemptId} and status='running' and deadline_at>clock_timestamp() and exists(select 1 from turns where id=${a.turnId} and current_attempt_id=${a.attemptId})`,
        z.object({ id: z.string() }),
      );
      if (!live) throw new AppError("ATTEMPT_TIMEOUT");
      await db.execute(
        sql`insert into provider_calls(id,attempt_id,phase,call_number,provider,requested_model,request_settings,status) values(${id},${a.attemptId},${phase},1,'scripted','fixture-v1',${JSON.stringify({ timeout_ms: remaining, max_output_tokens: phase === "answer" ? 2000 : 256 })}::jsonb,'started')`,
      );
    });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AppError("ATTEMPT_TIMEOUT"));
      }, remaining);
    });
    let result: ProviderResult;
    const callStart = Date.now();
    try {
      result = await Promise.race([
        this.provider.call(phase, a.context, candidate, controller.signal),
        timeout,
      ]);
    } catch (error) {
      await this.database.db.execute(
        sql`update provider_calls set status='unknown',ended_at=clock_timestamp(),duration_ms=${Date.now() - callStart},error_code='PROVIDER_UNAVAILABLE' where id=${id} and status='started'`,
      );
      throw error instanceof AppError
        ? error
        : new AppError("MODEL_SERVICE_FAILED");
    } finally {
      if (timer) clearTimeout(timer);
    }
    let value: unknown;
    let invalid = false;
    try {
      if (!result.complete) throw new Error("Incomplete output");
      value = parseRawJson(result.raw, 262144);
    } catch {
      invalid = true;
    }
    await this.database.db.execute(
      sql`update provider_calls set status='succeeded',ended_at=clock_timestamp(),duration_ms=${Date.now() - callStart},finish_code=${result.complete ? "complete" : "incomplete"},validation_code=${invalid ? "INVALID" : "RAW_VALID"},input_tokens=${result.inputTokens},output_tokens=${result.outputTokens},usage_updated_at=clock_timestamp() where id=${id} and status='started'`,
    );
    if (invalid)
      throw new AppError(
        phase === "answer" ? "OUTPUT_INVALID" : "SAFETY_CHECK_FAILED",
      );
    return value;
  }
  private async complete(
    sessionId: string,
    conversationId: string,
    a: Accepted,
    content: AnswerContent,
  ): Promise<void> {
    m1AnswerSchema.parse(content);
    await this.database.transaction("complete", async (db) => {
      await lockConversation(db, sessionId, conversationId);
      await this.reconcileLocked(db, conversationId);
      // clock_timestamp is checked at transition, after lock wait; now() would accept stale work.
      const [won] = await rows(
        db,
        sql`update attempts set status='completed',finished_at=clock_timestamp() where id=${a.attemptId} and status='running' and deadline_at>clock_timestamp() and exists(select 1 from turns where id=${a.turnId} and current_attempt_id=${a.attemptId} and status='running') and exists(select 1 from sessions where id=${sessionId} and revoked_at is null and expires_at>clock_timestamp()) returning finished_at`,
        z.object({ finished_at: dateValue }),
      );
      if (!won) return;
      await db.execute(
        sql`insert into messages(id,turn_id,role,attempt_id,content,response_kind,content_schema_version,created_at) values(${randomUUID()},${a.turnId},'assistant',${a.attemptId},${JSON.stringify(content)}::jsonb,'answer','v1',${new Date(won.finished_at)})`,
      );
      await db.execute(
        sql`update turns set status='completed',updated_at=clock_timestamp() where id=${a.turnId}`,
      );
      await db.execute(
        sql`update generation_slots set attempt_id=null,leased_until=null where attempt_id=${a.attemptId}`,
      );
      await this.advance(db, conversationId);
    });
  }
}
