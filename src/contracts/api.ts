import { z } from "zod";

export const LIMITS = Object.freeze({
  question_max_code_points: 2000,
  request_body_max_bytes: 16384,
  conversation_max_turns: 20,
  attempts_max_per_turn: 3,
  attempt_timeout_seconds: 60,
});
// The protocol explicitly rejects NUL and unpaired surrogate code units.
export const scalar = (s: string): boolean =>
  // eslint-disable-next-line no-control-regex
  !/[\u0000\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\u0000/u.test(
    s,
  );
export const normalize = (s: string): string =>
  s.replace(/\r\n?/g, "\n").trim();
export const textSchema = (max: number) =>
  z
    .string()
    .refine((s) => scalar(s) && s.trim().length > 0 && [...s].length <= max);
export const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
export const operationId = uuid.refine((s) => s[14] === "4");
export const timestamp = z.string().datetime({ precision: 3 });
export const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const sourceSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  title: textSchema(300),
  url: z
    .string()
    .refine((s) => {
      try {
        const u = new URL(s);
        return (
          scalar(s) &&
          [...s].length <= 2048 &&
          !Array.from(s).some(
            (c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127,
          ) &&
          u.protocol === "https:" &&
          !u.username &&
          !u.password
        );
      } catch {
        return false;
      }
    })
    .nullable(),
  locator: textSchema(300).nullable(),
});
export const answerSchema = z.strictObject({
  answer: textSchema(6000),
  claims: z
    .array(
      z.strictObject({
        text: textSchema(600),
        source: sourceSchema.nullable(),
      }),
    )
    .max(20),
});
export const m1AnswerSchema = answerSchema.refine((x) =>
  x.claims.every((c) => c.source === null),
);
export type AnswerContent = z.infer<typeof answerSchema>;
export const submitSchema = z.strictObject({
  client_submission_id: operationId,
  question: z
    .string()
    .refine(
      (s) =>
        scalar(s) &&
        normalize(s).length > 0 &&
        [...normalize(s)].length <= LIMITS.question_max_code_points,
    ),
});
export const createSchema = z.strictObject({
  client_conversation_id: operationId,
});
export const retrySchema = z.strictObject({
  client_attempt_id: operationId,
  failed_attempt_id: uuid,
});
export const emptySchema = z.strictObject({});
export const failureCodes = [
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_CAPACITY_EXCEEDED",
  "MODEL_SERVICE_FAILED",
  "OUTPUT_INVALID",
  "OUTPUT_REJECTED",
  "SAFETY_CHECK_FAILED",
  "ATTEMPT_TIMEOUT",
  "STORAGE_FAILED",
  "ATTEMPT_FAILED",
] as const;
export const errorCodes = [
  "INVALID_REQUEST",
  "SESSION_UNAVAILABLE",
  "REQUEST_FORBIDDEN",
  "CONVERSATION_UNAVAILABLE",
  "TURN_UNAVAILABLE",
  "ENDPOINT_NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "IDEMPOTENCY_CONFLICT",
  "CONVERSATION_BUSY",
  "CONVERSATION_LIMIT_REACHED",
  "TURN_ACTIVE",
  "STALE_ATTEMPT",
  "RETRY_NOT_ALLOWED",
  "BODY_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "GENERATION_UNAVAILABLE",
  "STORAGE_UNAVAILABLE",
  "SERVICE_NOT_READY",
  "INTERNAL_ERROR",
  ...failureCodes,
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export type FailureCode = (typeof failureCodes)[number];
export const apiErrorSchema = z.strictObject({
  code: z.enum(errorCodes),
  message: textSchema(300),
  operation_state: z.enum([
    "not_accepted",
    "accepted",
    "unknown",
    "not_applicable",
  ]),
  field_errors: z
    .array(z.strictObject({ field: textSchema(100), message: textSchema(300) }))
    .max(10),
  recovery: z.strictObject({
    action: z.enum([
      "edit_request",
      "check_status",
      "repeat_request",
      "reload_conversation",
      "refresh_session",
      "start_new_chat",
      "none",
    ]),
    conversation_id: uuid.nullable(),
    client_submission_id: uuid.nullable(),
    turn_id: uuid.nullable(),
    client_attempt_id: uuid.nullable(),
    retry_after_seconds: count.min(1).nullable(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
export const sessionSchema = z.strictObject({
  diagnostics_enabled: z.boolean(),
  provider_mode: z.enum(["scripted", "groq"]),
  generation_enabled: z.boolean(),
  expires_at: timestamp,
  csrf_token: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  limits: z.strictObject({
    question_max_code_points: count.min(1),
    request_body_max_bytes: count.min(1),
    conversation_max_turns: count.min(1),
    attempts_max_per_turn: count.min(1),
    attempt_timeout_seconds: count.min(1),
  }),
});
export const turnSchema = z
  .strictObject({
    id: uuid,
    conversation_id: uuid,
    conversation_revision: count,
    client_submission_id: operationId,
    sequence: count.min(1),
    status: z.enum(["running", "completed", "failed"]),
    user_message: z.strictObject({
      id: uuid,
      role: z.literal("user"),
      text: z.string().refine(scalar),
      created_at: timestamp,
    }),
    assistant_message: z
      .strictObject({
        id: uuid,
        role: z.literal("assistant"),
        kind: z.enum(["answer", "refusal", "clarification"]),
        content: answerSchema,
        created_at: timestamp,
      })
      .nullable(),
    current_attempt: z.strictObject({
      id: uuid,
      number: count.min(1),
      client_attempt_id: operationId.nullable(),
      started_at: timestamp,
      deadline_at: timestamp,
      finished_at: timestamp.nullable(),
    }),
    failure: z
      .strictObject({
        code: z.enum(failureCodes),
        message: textSchema(300),
        retry_at: timestamp.nullable(),
      })
      .nullable(),
    retry: z.strictObject({
      allowed: z.boolean(),
      reason: z
        .enum([
          "turn_running",
          "turn_completed",
          "not_latest_turn",
          "attempt_limit_reached",
        ])
        .nullable(),
      attempts_remaining: count,
    }),
  })
  .superRefine((t, ctx) => {
    const terminal = t.status !== "running";
    if (
      (t.assistant_message !== null) !== (t.status === "completed") ||
      (t.failure !== null) !== (t.status === "failed") ||
      (t.failure !== null &&
        (t.failure.retry_at !== null) !==
          (t.failure.code === "PROVIDER_RATE_LIMITED")) ||
      (t.current_attempt.finished_at !== null) !== terminal ||
      (t.current_attempt.number === 1) !==
        (t.current_attempt.client_attempt_id === null) ||
      t.retry.allowed !== (t.retry.reason === null) ||
      (t.status === "running" && t.retry.reason !== "turn_running") ||
      (t.status === "completed" && t.retry.reason !== "turn_completed") ||
      (t.status === "failed" &&
        (t.retry.reason === "turn_running" ||
          t.retry.reason === "turn_completed")) ||
      t.current_attempt.deadline_at <= t.current_attempt.started_at ||
      (t.current_attempt.finished_at !== null &&
        t.current_attempt.finished_at < t.current_attempt.started_at) ||
      (t.retry.allowed &&
        (t.status !== "failed" || !t.retry.attempts_remaining))
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent turn" });
  });
export type TurnView = z.infer<typeof turnSchema>;
export const conversationSchema = z
  .strictObject({
    id: uuid,
    created_at: timestamp,
    revision: count,
    turn_count: count,
    active_turn_id: uuid.nullable(),
    turns: z.array(turnSchema).max(20),
  })
  .superRefine((c, ctx) => {
    const running = c.turns.filter((t) => t.status === "running");
    if (
      c.turn_count !== c.turns.length ||
      running.length > 1 ||
      c.active_turn_id !== (running[0]?.id ?? null) ||
      c.turns.some(
        (t, i) =>
          t.sequence !== i + 1 ||
          t.conversation_id !== c.id ||
          t.conversation_revision !== c.revision ||
          (t.status === "failed" &&
            t.retry.reason !==
              (i < c.turns.length - 1
                ? "not_latest_turn"
                : t.retry.attempts_remaining === 0
                  ? "attempt_limit_reached"
                  : null)),
      )
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent conversation" });
  });
export type ConversationView = z.infer<typeof conversationSchema>;
export const operationSchema = z.strictObject({
  turn: turnSchema,
  operation: z.strictObject({ attempt_id: uuid, replayed: z.boolean() }),
});
export const turnReadSchema = z.strictObject({ turn: turnSchema });
export const lookupSchema = z
  .strictObject({ recorded: z.boolean(), turn: turnSchema.nullable() })
  .refine((x) => x.recorded === (x.turn !== null));
export const metaSchema = z.strictObject({
  request_id: uuid,
  server_time: timestamp,
});
export const envelope = <T extends z.ZodType>(schema: T) =>
  z.union([
    z.strictObject({ data: schema, meta: metaSchema }),
    z.strictObject({ error: apiErrorSchema, meta: metaSchema }),
  ]);
