import { expect } from "vitest";
import {
  fixtureResult,
  type Provider,
  type Phase,
  type ProviderResult,
} from "../../src/server/provider";
export type Entry = {
  phase: Phase;
  result: ProviderResult | Error | (() => Promise<ProviderResult>);
};
export class ScriptedProvider implements Provider {
  readonly calls: {
    phase: Phase;
    context: string;
    candidate: string | null;
    signal: AbortSignal;
  }[] = [];
  constructor(private readonly entries: Entry[]) {}
  async call(
    phase: Phase,
    context: string,
    candidate: string | null,
    signal: AbortSignal,
  ): Promise<ProviderResult> {
    this.calls.push({ phase, context, candidate, signal });
    const entry = this.entries.shift();
    expect(entry?.phase, "Unexpected or additional provider phase").toBe(phase);
    if (!entry) throw new Error("Unexpected call");
    if (entry.result instanceof Error) throw entry.result;
    return typeof entry.result === "function"
      ? await entry.result()
      : entry.result;
  }
  done(): void {
    expect(this.entries, "Unused required script entries").toHaveLength(0);
  }
}
export const allow = () => ({
  phase: "input_safety" as const,
  result: fixtureResult({ action: "allow", reason: "general_education" }),
});
export const answer = () => ({
  phase: "answer" as const,
  result: fixtureResult({
    answer: "Synthetic saved response.",
    claims: [{ text: "Synthetic fixture.", source: null }],
  }),
});
export const review = () => ({
  phase: "output_safety" as const,
  result: fixtureResult({ action: "allow", reason: "within_scope" }),
});
export function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
