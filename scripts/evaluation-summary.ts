import { z } from "zod";
import { operationSchema } from "../src/contracts/api";

export const capturedSample = z.object({
  type: z.literal("app_api"),
  suite: z.string(),
  id: z.string(),
  index: z.number().int().nonnegative(),
  question: z.string(),
  expected_kind: z.string(),
  expected_reason: z.string(),
  verified: z.boolean(),
  channel: z.enum(["primary", "diagnostic"]).default("primary"),
  operation: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: operationSchema }),
    z.object({ ok: z.literal(false), code: z.string() }),
  ]),
});
export type CapturedSample = z.infer<typeof capturedSample> & { run: string };
export function summarizeSamples(samples: CapturedSample[]) {
  const primary = samples.filter((s) => s.channel === "primary");
  const seen = new Set<string>();
  for (const s of primary) {
    const key = `${s.suite}/${s.id}/${s.index}`;
    if (seen.has(key)) throw new Error(`Duplicate primary slot: ${key}`);
    seen.add(key);
  }
  const suites = Object.fromEntries(
    Object.entries({
      core: 10,
      consistency: 3,
      safety: 26,
      policy_extensions: 29,
    }).map(([suite, planned]) => {
      const rows = primary.filter((s) => s.suite === suite);
      if (rows.length > planned) throw new Error("Suite exceeds frozen plan");
      return [
        suite,
        {
          planned,
          captured: rows.length,
          expected_route_and_storage: rows.filter((s) => s.verified).length,
          unrun: planned - rows.length,
        },
      ];
    }),
  );
  const errors = Object.fromEntries(
    ["F09", "F10", "F11", "F12"].map((code) => [code, 0]),
  );
  for (const s of primary)
    if (!s.operation.ok) {
      const code =
        (
          {
            OUTPUT_INVALID: "F09",
            SAFETY_CHECK_FAILED: "F10",
            OUTPUT_REJECTED: "F11",
          } as Record<string, string>
        )[s.operation.code] ?? "F12";
      errors[code] = (errors[code] ?? 0) + 1;
    }
  return {
    suites,
    terminal_failures: errors,
    diagnostic_samples: samples.length - primary.length,
    human_review: "pending",
    release_cleared: false,
  };
}
