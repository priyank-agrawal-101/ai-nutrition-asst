import "server-only";
import { sql } from "drizzle-orm";
import type { Config } from "./config";
import type { Database } from "./db/connection";
import { lockConversation } from "./db/conversations";
import type { Phase, ProviderResult } from "./provider";

type Observation = {
  text: string;
  complete: boolean;
  truncated: boolean;
  redacted: boolean;
};
export function diagnosticText(
  raw: Uint8Array,
  secrets: readonly string[],
  maxBytes = 65536,
): Omit<Observation, "complete"> {
  const decoded = Buffer.from(raw.subarray(0, maxBytes)).toString("utf8");
  let text = decoded.split(String.fromCharCode(0)).join("\uFFFD");
  for (const secret of secrets
    .filter((s) => s.length >= 8)
    .sort((a, b) => b.length - a.length))
    text = text.split(secret).join("[REDACTED]");
  text = text.replace(
    /\b(?:gsk_[A-Za-z0-9_-]{15,}|sk-[A-Za-z0-9_-]{20,})\b/g,
    "[REDACTED]",
  );
  return {
    text,
    truncated: raw.byteLength > maxBytes,
    redacted: text !== decoded,
  };
}

// Per-execution collector: no cross-request mutable map, no prompts/context copied.
export class AttemptDiagnostics {
  private readonly active: boolean;
  private readonly observations: Partial<Record<Phase, Observation>> = {};
  constructor(private readonly config: Config) {
    this.active = config.environment === "local" && config.diagnosticsEnabled;
  }
  observe = (phase: Phase, result: ProviderResult): void => {
    if (!this.active || !this.config.diagnosticsEnabled) return;
    try {
      const secrets = [
        this.config.groqApiKey ?? "",
        this.config.databaseUrl,
        decodeURIComponent(new URL(this.config.databaseUrl).password),
        this.config.quotaKey,
        ...Object.values(this.config.csrfKeys),
      ];
      this.observations[phase] = {
        ...diagnosticText(
          result.raw,
          secrets,
          phase === "answer" ? 65536 : 4096,
        ),
        complete: result.complete,
      };
    } catch {
      /* Optional capture cannot change the provider result. */
    }
  };
  async save(
    database: Database,
    sessionId: string,
    conversationId: string,
    turnId: string,
    attemptId: string,
  ): Promise<void> {
    if (
      !this.active ||
      !this.config.diagnosticsEnabled ||
      !Object.keys(this.observations).length
    )
      return;
    try {
      await database.transaction("diagnostic_capture", async (db) => {
        await lockConversation(db, sessionId, conversationId);
        await db.execute(sql`select pg_advisory_xact_lock(713293)`);
        await db.execute(
          sql`delete from model_diagnostics where expires_at<=clock_timestamp()`,
        );
        if (!this.config.diagnosticsEnabled) return;
        await db.execute(sql`insert into model_diagnostics(attempt_id,reason,expires_at,payload)
          select a.id,coalesce(a.failure_code,'INPUT_BOUNDARY'),least(clock_timestamp()+interval '24 hours',s.expires_at),${JSON.stringify(this.observations)}::jsonb
          from attempts a join turns t on t.id=a.turn_id join conversations c on c.id=t.conversation_id join sessions s on s.id=c.session_id
          where a.id=${attemptId} and t.id=${turnId} and t.current_attempt_id=a.id and c.id=${conversationId} and s.id=${sessionId} and s.revoked_at is null and s.expires_at>clock_timestamp()
          and (a.status='failed' or (a.status='completed' and a.input_route='model' and a.input_reason<>'general_education'))
          on conflict(attempt_id) do nothing`);
        // Keep the newest 100 captures; successful answers do not evict a record.
        await db.execute(
          sql`delete from model_diagnostics where attempt_id in(select attempt_id from model_diagnostics order by captured_at desc,attempt_id offset 100)`,
        );
      });
    } catch {
      // Optional diagnostics must never alter a committed result or trigger regeneration.
      // No exception text, candidate or credentials enter ordinary logs.
    }
  }
}
