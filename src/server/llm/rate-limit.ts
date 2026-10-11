import "server-only";
import { AppError } from "../errors";
import { groqSettings } from "./settings";

export type BudgetEntry = { age_ms: number; tokens: number };
export type DailyBudget = { maxCalls: number; maxTokens: number };

// Find when enough existing reservations expire; unknown usage still counts in full.
export function budgetWait(
  entries: BudgetEntry[],
  tokens: number,
  budget: DailyBudget,
): number {
  const dailyCalls = Math.min(budget.maxCalls, groqSettings.requestsPerDay);
  const dailyTokens = Math.min(budget.maxTokens, groqSettings.tokensPerDay);
  if (tokens > groqSettings.tokensPerMinute || tokens > dailyTokens)
    throw new AppError(
      "PROVIDER_CAPACITY_EXCEEDED",
      "not_accepted",
      "edit_request",
    );
  let wait = 0;
  for (const [windowMs, maxCalls, maxTokens] of [
    [60000, groqSettings.requestsPerMinute, groqSettings.tokensPerMinute],
    [86400000, dailyCalls, dailyTokens],
  ]) {
    const active = entries
      .filter((e) => e.age_ms < windowMs!)
      .sort((a, b) => b.age_ms - a.age_ms);
    let calls = active.length;
    let used = active.reduce((sum, e) => sum + e.tokens, 0);
    for (const entry of active) {
      if (calls < maxCalls! && used + tokens <= maxTokens!) break;
      calls--;
      used -= entry.tokens;
      wait = Math.max(wait, Math.ceil((windowMs! - entry.age_ms) / 1000));
    }
  }
  return wait;
}

export function providerRetryAfter(
  value: string | null,
  now = Date.now(),
): number {
  const seconds =
    value && /^\d+(?:\.\d+)?$/.test(value.trim())
      ? Number(value)
      : value
        ? (Date.parse(value) - now) / 1000
        : NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(86400, Math.max(1, Math.ceil(seconds)))
    : 60;
}
