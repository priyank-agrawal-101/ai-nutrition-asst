import "server-only";
import { getEncoding } from "js-tiktoken";
import { z } from "zod";
import type { Phase } from "../provider";
import { prompts } from "../prompts/bundle";
import { nativeSchemas } from "./schemas";
import { groqSettings } from "./settings";
import { AppError } from "../errors";
// GPT-OSS uses the o200k merge vocabulary with additional Harmony framing tokens.
// Encode serialized data as ordinary text, including special-token-looking visitor strings.
const encoder = getEncoding("o200k_base");
export const tokens = (s: string): number => encoder.encode(s, [], []).length;
export function requestBody(
  phase: Phase,
  context: string,
  candidate: string | null,
) {
  const data =
    phase === "output_safety"
      ? JSON.stringify({
          context: JSON.parse(context) as unknown,
          candidate: JSON.parse(candidate ?? "null") as unknown,
        })
      : context;
  return {
    model: groqSettings.model,
    messages: [
      { role: "system", content: prompts[phase] },
      { role: "user", content: data },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: phase + "_v1",
        strict: true,
        schema: nativeSchemas[phase],
      },
    },
    temperature: groqSettings.temperature,
    reasoning_effort: groqSettings.reasoning_effort,
    include_reasoning: false,
    stream: false,
    max_completion_tokens: groqSettings.outputTokens[phase],
  };
}
export function requestBudget(
  phase: Phase,
  context: string,
  candidate: string | null,
): number {
  // 128 extra tokens reserve Harmony framing beyond the entire serialized request.
  // All three native-schema probes observed 71-84 fewer input tokens than serialization alone.
  return (
    tokens(JSON.stringify(requestBody(phase, context, candidate))) +
    128 +
    groqSettings.outputTokens[phase]
  );
}
export function checkModelCapacity(context: string): void {
  // Worst possible valid answer uses at most 72k UTF-8 bytes plus JSON escaping.
  // The API forbids control NUL; six-byte JSON escapes are conservatively reserved for every code point.
  const reviewCandidateBound = 6 * (6000 + 20 * 600) + 2048;
  for (const phase of ["input_safety", "answer", "output_safety"] as const) {
    const n =
      requestBudget(
        phase,
        context,
        phase === "output_safety" ? '{"answer":"","claims":[]}' : null,
      ) + (phase === "output_safety" ? reviewCandidateBound : 0);
    if (n > groqSettings.contextWindow)
      throw new AppError("CONVERSATION_LIMIT_REACHED");
  }
}
export const safeIdentifier = z.string().regex(/^[a-zA-Z0-9_./:-]{1,200}$/);
