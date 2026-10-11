import "server-only";
import { z } from "zod";
export const phaseSchema = z.enum(["input_safety", "answer", "output_safety"]);
export type Phase = z.infer<typeof phaseSchema>;
export type ProviderResult = {
  raw: Uint8Array;
  complete: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
  reportedModel?: string | null;
  requestId?: string | null;
  finishCode?: string | null;
};
export interface Provider {
  call(
    phase: Phase,
    context: string,
    candidate: string | null,
    signal: AbortSignal,
  ): Promise<ProviderResult>;
}
export { inputVerdict, outputVerdict } from "./safety/verdicts";
export function fixtureResult(value: unknown): ProviderResult {
  return {
    raw: Buffer.from(JSON.stringify(value)),
    complete: true,
    inputTokens: null,
    outputTokens: null,
  };
}
// Local foundation only. It never interprets visitor text or claims to provide nutrition advice.
export class LocalScriptedProvider implements Provider {
  call(
    phase: Phase,
    _context: string,
    _candidate: string | null,
    signal: AbortSignal,
  ): Promise<ProviderResult> {
    signal.throwIfAborted();
    return Promise.resolve(
      fixtureResult(
        phase === "input_safety"
          ? { action: "allow", reason: "general_education" }
          : phase === "output_safety"
            ? { action: "allow", reason: "within_scope" }
            : {
                answer:
                  "This is a scripted local test response. Your question was saved. Enable the Groq configuration for AI answers.",
                claims: [],
              },
      ),
    );
  }
}
