import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { rows, type Database, dateValue } from "./db/connection";
import { lockConversation } from "./db/conversations";
import type { TurnService } from "./turn-service";
import type { EventSink } from "./telemetry";
export async function maintenance(
  database: Database,
  turns: TurnService,
  sink: EventSink,
): Promise<void> {
  const start = Date.now();
  let reconciled = 0,
    purged = 0;
  const expired = await rows(
    database.db,
    sql`select distinct c.id,c.session_id from conversations c join turns t on t.conversation_id=c.id join attempts a on a.id=t.current_attempt_id where a.status='running' and a.deadline_at<=clock_timestamp() limit 100`,
    z.object({ id: z.string(), session_id: z.string() }),
  );
  for (const c of expired) {
    await database.transaction("reconcile", async (db) => {
      await lockConversation(db, c.session_id, c.id, false);
      reconciled += await turns.reconcileLocked(db, c.id);
    });
  }
  const [oldest] = await rows(
    database.db,
    sql`select min(least(expires_at,coalesce(revoked_at,expires_at))) as cutoff from sessions where expires_at<=clock_timestamp() or revoked_at is not null`,
    z.object({ cutoff: dateValue.nullable() }),
  );
  await database.transaction("purge", async (db) => {
    const sessions = await rows(
      db,
      sql`select id from sessions where expires_at<=clock_timestamp() or revoked_at is not null order by id for update skip locked limit 100`,
      z.object({ id: z.string() }),
    );
    for (const s of sessions) {
      const owned = sql`select a.id from attempts a join turns t on t.id=a.turn_id join conversations c on c.id=t.conversation_id where c.session_id=${s.id}`;
      await db.execute(
        sql`update generation_slots set attempt_id=null,leased_until=null where attempt_id in (${owned})`,
      );
      await db.execute(
        sql`delete from provider_calls where attempt_id in (${owned})`,
      );
      await db.execute(
        sql`delete from messages where turn_id in(select t.id from turns t join conversations c on c.id=t.conversation_id where c.session_id=${s.id})`,
      );
      await db.execute(sql`delete from attempts where id in (${owned})`);
      await db.execute(
        sql`delete from turns where conversation_id in(select id from conversations where session_id=${s.id})`,
      );
      await db.execute(sql`delete from conversations where session_id=${s.id}`);
      await db.execute(sql`delete from sessions where id=${s.id}`);
      purged++;
    }
    await db.execute(
      sql`delete from quota_buckets where expires_at<=clock_timestamp()`,
    );
  });
  sink({
    event: "maintenance",
    purged_sessions: purged,
    reconciled_attempts: reconciled,
    duration_ms: Date.now() - start,
    oldest_cutoff: oldest?.cutoff ?? null,
  });
}
