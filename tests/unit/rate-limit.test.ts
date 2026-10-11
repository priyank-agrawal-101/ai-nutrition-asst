import { expect, it } from "vitest";
import {
  budgetWait,
  providerRetryAfter,
} from "../../src/server/llm/rate-limit";
import { GroqProvider } from "../../src/server/llm/groq";
const limits = { maxCalls: 1000, maxTokens: 200000 };
it("EC-OPS-05 waits only until enough rolling minute reservations expire", () => {
  const entries = [
    { age_ms: 50000, tokens: 4000 },
    { age_ms: 10000, tokens: 2600 },
  ];
  expect(budgetWait(entries, 2200, limits)).toBe(10);
  expect(
    budgetWait(
      entries.map((e) => ({ ...e, age_ms: e.age_ms + 10000 })),
      2200,
      limits,
    ),
  ).toBe(0);
  expect(budgetWait([{ age_ms: 60000, tokens: 8000 }], 8000, limits)).toBe(0);
});
it("EC-OPS-05 distinguishes daily exhaustion and impossible requests", () => {
  expect(budgetWait([{ age_ms: 7200000, tokens: 200000 }], 1000, limits)).toBe(
    79200,
  );
  expect(
    budgetWait(
      Array.from({ length: 30 }, () => ({ age_ms: 1000, tokens: 1 })),
      1,
      limits,
    ),
  ).toBe(59);
  expect(() => budgetWait([], 8001, limits)).toThrow(
    "PROVIDER_CAPACITY_EXCEEDED",
  );
  expect(() => budgetWait([], 2000, { ...limits, maxTokens: 1000 })).toThrow(
    "PROVIDER_CAPACITY_EXCEEDED",
  );
});
it("EC-MODEL-16 parses bounded Retry-After seconds/dates without trusting error bodies", async () => {
  expect(providerRetryAfter("2.1")).toBe(3);
  expect(
    providerRetryAfter(
      "Sun, 11 Oct 2026 12:01:00 GMT",
      Date.parse("2026-10-11T12:00:00Z"),
    ),
  ).toBe(60);
  for (const value of [null, "invalid", "-5", "0"])
    expect(providerRetryAfter(value)).toBe(60);
  expect(providerRetryAfter("9999999999999")).toBe(86400);
  const provider = new GroqProvider("fixture", () =>
    Promise.resolve(
      new Response("PRIVATE", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    ),
  );
  await expect(
    provider.call(
      "input_safety",
      '{"question":"synthetic"}',
      null,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", wait: 120 });
});
