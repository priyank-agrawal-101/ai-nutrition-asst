import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { rows, type Db } from "../db/connection";
import { groqSettings } from "./settings";
import { AppError } from "../errors";
import { budgetWait, type DailyBudget } from "./rate-limit";
export async function checkProviderBudget(
  db: Db,
  tokens: number,
  budget: DailyBudget = {
    maxCalls: groqSettings.requestsPerDay,
    maxTokens: groqSettings.tokensPerDay,
  },
): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(713292)`);
  const entries = await rows(
    db,
    sql`select (extract(epoch from (clock_timestamp()-started_at))*1000)::float8 as age_ms,coalesce(observed_tokens,reserved_tokens)::float8 as tokens from provider_budget where started_at>clock_timestamp()-interval '24 hours'`,
    z.object({ age_ms: z.number(), tokens: z.number() }),
  );
  const [cooldown] = await rows(
    db,
    sql`select greatest(0,ceil(extract(epoch from (retry_at-clock_timestamp()))))::integer as seconds from provider_cooldown where id=1`,
    z.object({ seconds: z.number() }),
  );
  const wait = Math.max(
    budgetWait(entries, tokens, budget),
    cooldown?.seconds ?? 0,
  );
  if (wait > 0)
    throw new AppError(
      "PROVIDER_RATE_LIMITED",
      "not_accepted",
      "repeat_request",
      wait,
    );
}

export async function recordProviderCooldown(
  db: Db,
  seconds: number,
): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(713292)`);
  await db.execute(
    sql`insert into provider_cooldown(id,retry_at) values(1,clock_timestamp()+make_interval(secs => ${seconds})) on conflict(id) do update set retry_at=greatest(provider_cooldown.retry_at,excluded.retry_at)`,
  );
}
export async function reserveProviderBudget(
  db: Db,
  id: string,
  tokens: number,
  budget: { maxCalls: number; maxTokens: number } = {
    maxCalls: groqSettings.requestsPerDay,
    maxTokens: groqSettings.tokensPerDay,
  },
): Promise<void> {
  // One configured Groq account across this app's processes; no locks held during network I/O.
  await checkProviderBudget(db, tokens, budget);
  await db.execute(
    sql`insert into provider_budget(id,reserved_tokens) values(${id},${tokens})`,
  );
}
export async function observeProviderBudget(
  db: Db,
  id: string,
  input: number | null,
  output: number | null,
): Promise<void> {
  // Unknown usage keeps the entire reservation until its rolling window expires.
  if (input !== null && output !== null && Number.isSafeInteger(input + output))
    await db.execute(
      sql`update provider_budget set observed_tokens=${input + output} where id=${id}`,
    );
}
