import "server-only";
import { z } from "zod";
export const phaseSchema = z.enum(["input_safety", "answer", "output_safety"]);
export type Phase = z.infer<typeof phaseSchema>;
export type ProviderResult = {
  raw: Uint8Array;
  complete: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
};
export interface Provider {
  call(
    phase: Phase,
    context: string,
    candidate: string | null,
    signal: AbortSignal,
  ): Promise<ProviderResult>;
}
export const inputVerdict = z.strictObject({
  verdict: z.literal("allow"),
  reason: z.literal("scripted_fixture"),
});
export const outputVerdict = z.strictObject({
  verdict: z.enum(["accept", "reject"]),
});
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
          ? { verdict: "allow", reason: "scripted_fixture" }
          : phase === "output_safety"
            ? { verdict: "accept" }
            : {
                answer:
                  "This is a scripted local test response. Your question was saved. Nutrition answers and model safety review arrive in Phase 2.",
                claims: [],
              },
      ),
    );
  }
}
