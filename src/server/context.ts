import "server-only";
import type { ConversationView } from "@/contracts/api";
import { digest } from "./security";
import { AppError } from "./errors";
export function buildContext(
  conversation: ConversationView,
  question: string,
  sequence: number,
  maxTokens = 8000,
) {
  const context = {
    version: "v1",
    prior_turns: conversation.turns
      .filter((t) => t.sequence < sequence)
      .map((t) => ({
        question: t.user_message.text.replace(/\r\n?/g, "\n").trim(),
        status: t.status,
        response_kind: t.assistant_message?.kind ?? null,
        content: t.assistant_message?.content ?? null,
      })),
    current_question: question,
  };
  const canonical = JSON.stringify(context);
  // UTF-8 bytes are a conservative upper bound for byte-level tokenizers; no character/token equality assumption.
  const tokenUpperBound = Buffer.byteLength(canonical, "utf8");
  if (sequence > 20 || tokenUpperBound > maxTokens)
    throw new AppError("CONVERSATION_LIMIT_REACHED");
  return { canonical, digest: digest(canonical), tokenUpperBound };
}
