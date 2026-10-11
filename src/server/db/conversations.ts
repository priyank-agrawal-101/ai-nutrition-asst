import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  conversationSchema,
  type ConversationView,
  LIMITS,
} from "@/contracts/api";
import { type Db, rows, dateValue, intValue } from "./connection";
import { lockSession } from "../security";
import { AppError } from "../errors";
export async function lockConversation(
  db: Db,
  sessionId: string,
  conversationId: string,
  live = true,
): Promise<void> {
  await lockSession(db, sessionId, live);
  const [c] = await rows(
    db,
    sql`select id from conversations where id=${conversationId} and session_id=${sessionId} for update`,
    z.object({ id: z.string() }),
  );
  if (!c) throw new AppError("CONVERSATION_UNAVAILABLE");
}
// One transaction and parent lock produce a single revision across all nested records.
export async function snapshot(
  db: Db,
  sessionId: string,
  conversationId: string,
): Promise<ConversationView> {
  const [c] = await rows(
    db,
    sql`select c.id,c.created_at,c.revision from conversations c join sessions s on s.id=c.session_id where c.id=${conversationId} and s.id=${sessionId} and s.revoked_at is null and s.expires_at>clock_timestamp()`,
    z.object({ id: z.string(), created_at: dateValue, revision: intValue }),
  );
  if (!c) throw new AppError("CONVERSATION_UNAVAILABLE");
  const result = await rows(
    db,
    sql`select t.id,t.client_submission_id,t.sequence,t.status,a.id as attempt_id,a.number,a.client_attempt_id,a.started_at,a.deadline_at,a.finished_at,a.failure_code,a.failure_message,u.id as user_id,u.user_text,u.created_at as user_created_at,m.id as assistant_id,m.content,m.response_kind,m.created_at as assistant_created_at from turns t join attempts a on a.id=t.current_attempt_id join messages u on u.turn_id=t.id and u.role='user' left join messages m on m.turn_id=t.id and m.role='assistant' where t.conversation_id=${conversationId} order by t.sequence`,
    z.object({
      id: z.string(),
      client_submission_id: z.string(),
      sequence: z.number(),
      status: z.enum(["running", "completed", "failed"]),
      attempt_id: z.string(),
      number: z.number(),
      client_attempt_id: z.string().nullable(),
      started_at: dateValue,
      deadline_at: dateValue,
      finished_at: dateValue.nullable(),
      failure_code: z.string().nullable(),
      failure_message: z.string().nullable(),
      user_id: z.string(),
      user_text: z.string(),
      user_created_at: dateValue,
      assistant_id: z.string().nullable(),
      content: z.unknown(),
      response_kind: z.string().nullable(),
      assistant_created_at: dateValue.nullable(),
    }),
  );
  const turns = result.map((t) => {
    const remaining = Math.max(0, LIMITS.attempts_max_per_turn - t.number);
    const reason =
      t.status === "running"
        ? "turn_running"
        : t.status === "completed"
          ? "turn_completed"
          : t.sequence !== result.length
            ? "not_latest_turn"
            : remaining === 0
              ? "attempt_limit_reached"
              : null;
    return {
      id: t.id,
      conversation_id: c.id,
      conversation_revision: c.revision,
      client_submission_id: t.client_submission_id,
      sequence: t.sequence,
      status: t.status,
      user_message: {
        id: t.user_id,
        role: "user",
        text: t.user_text,
        created_at: t.user_created_at,
      },
      assistant_message: t.assistant_id
        ? {
            id: t.assistant_id,
            role: "assistant",
            kind: t.response_kind,
            content: t.content,
            created_at: t.assistant_created_at,
          }
        : null,
      current_attempt: {
        id: t.attempt_id,
        number: t.number,
        client_attempt_id: t.client_attempt_id,
        started_at: t.started_at,
        deadline_at: t.deadline_at,
        finished_at: t.finished_at,
      },
      failure: t.failure_code
        ? { code: t.failure_code, message: t.failure_message }
        : null,
      retry: {
        allowed: reason === null,
        reason,
        attempts_remaining: remaining,
      },
    };
  });
  await lockSession(db, sessionId);
  return conversationSchema.parse({
    ...c,
    turn_count: turns.length,
    active_turn_id: turns.find((t) => t.status === "running")?.id ?? null,
    turns,
  });
}
