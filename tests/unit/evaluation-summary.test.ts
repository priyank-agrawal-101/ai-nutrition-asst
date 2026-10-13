import { expect, it } from "vitest";
import {
  summarizeSamples,
  type CapturedSample,
} from "../../scripts/evaluation-summary";
it("preserves primary failures, missing coverage and separate diagnostic outcomes", () => {
  const s: CapturedSample = {
    run: "synthetic",
    type: "app_api",
    channel: "primary",
    suite: "policy_extensions",
    id: "case",
    index: 0,
    question: "Fixture",
    expected_kind: "clarification",
    expected_reason: "unrelated_topic",
    verified: false,
    operation: { ok: false, code: "SAFETY_CHECK_FAILED" },
  };
  const r = summarizeSamples([
    s,
    { ...s, run: "diagnostic", channel: "diagnostic" },
  ]);
  expect(r.terminal_failures).toEqual({ F09: 0, F10: 1, F11: 0, F12: 0 });
  expect(r.suites.policy_extensions).toEqual({
    planned: 29,
    captured: 1,
    expected_route_and_storage: 0,
    unrun: 28,
  });
  expect(r.diagnostic_samples).toBe(1);
  expect(r.release_cleared).toBe(false);
  expect(() => summarizeSamples([s, s])).toThrow("Duplicate primary");
});
