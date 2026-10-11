import "server-only";
import type { ApiError, ErrorCode } from "@/contracts/api";
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly state: ApiError["operation_state"] = "not_accepted",
    public readonly action?: ApiError["recovery"]["action"],
    public readonly wait?: number,
  ) {
    super(code);
  }
}
export const statusFor = (code: ErrorCode): number => {
  if (["INVALID_REQUEST"].includes(code)) return 400;
  if (code === "SESSION_UNAVAILABLE") return 401;
  if (code === "REQUEST_FORBIDDEN") return 403;
  if (
    [
      "CONVERSATION_UNAVAILABLE",
      "TURN_UNAVAILABLE",
      "ENDPOINT_NOT_FOUND",
    ].includes(code)
  )
    return 404;
  if (code === "METHOD_NOT_ALLOWED") return 405;
  if (
    [
      "IDEMPOTENCY_CONFLICT",
      "CONVERSATION_BUSY",
      "CONVERSATION_LIMIT_REACHED",
      "TURN_ACTIVE",
      "STALE_ATTEMPT",
      "RETRY_NOT_ALLOWED",
    ].includes(code)
  )
    return 409;
  if (code === "BODY_TOO_LARGE") return 413;
  if (code === "UNSUPPORTED_MEDIA_TYPE") return 415;
  if (code === "VALIDATION_FAILED") return 422;
  if (code === "RATE_LIMITED") return 429;
  if (
    [
      "MODEL_SERVICE_FAILED",
      "OUTPUT_INVALID",
      "OUTPUT_REJECTED",
      "SAFETY_CHECK_FAILED",
    ].includes(code)
  )
    return 502;
  if (code === "ATTEMPT_TIMEOUT") return 504;
  if (
    [
      "GENERATION_UNAVAILABLE",
      "STORAGE_UNAVAILABLE",
      "SERVICE_NOT_READY",
      "STORAGE_FAILED",
    ].includes(code)
  )
    return 503;
  return 500;
};
export const safeMessage = (code: ErrorCode): string =>
  ({
    SESSION_UNAVAILABLE: "This session is unavailable. Start a new chat.",
    CONVERSATION_UNAVAILABLE: "This conversation is unavailable.",
    CONVERSATION_LIMIT_REACHED: "This conversation is full. Start a new chat.",
    STORAGE_UNAVAILABLE:
      "We couldn't confirm the saved state. Check again before trying another attempt.",
    RATE_LIMITED: "Please wait before trying again.",
    GENERATION_UNAVAILABLE: "New answers are temporarily unavailable.",
    VALIDATION_FAILED: "Check the request fields and question length.",
    INVALID_REQUEST:
      "The request is not valid JSON or contains unsupported values.",
    REQUEST_FORBIDDEN: "This request could not be verified.",
  })[code as string] ??
  "Couldn't complete the request. Check its status before trying again.";
export function publicError(error: AppError): ApiError {
  const action =
    error.action ??
    ([
      "SESSION_UNAVAILABLE",
      "CONVERSATION_UNAVAILABLE",
      "CONVERSATION_LIMIT_REACHED",
    ].includes(error.code)
      ? "start_new_chat"
      : [
            "IDEMPOTENCY_CONFLICT",
            "CONVERSATION_BUSY",
            "TURN_ACTIVE",
            "STALE_ATTEMPT",
            "RETRY_NOT_ALLOWED",
          ].includes(error.code)
        ? "check_status"
        : ["INVALID_REQUEST", "VALIDATION_FAILED", "BODY_TOO_LARGE"].includes(
              error.code,
            )
          ? "edit_request"
          : "none");
  return {
    code: error.code,
    message: safeMessage(error.code),
    operation_state: error.state,
    field_errors: [],
    recovery: {
      action,
      conversation_id: null,
      turn_id: null,
      client_attempt_id: null,
      client_submission_id: null,
      retry_after_seconds: error.wait ?? null,
    },
  };
}
