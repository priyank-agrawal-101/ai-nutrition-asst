import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { databaseTime, type Db } from "../../src/server/db/connection";
import { digest } from "../../src/server/security";
export async function seedTurn(
  db: Db,
  conversationId: string,
  options: {
    content?: unknown;
    missingUser?: boolean;
    wrongCurrent?: string;
    sequence?: number;
  } = {},
): Promise<string> {
  const turn = randomUUID(),
    attempt = randomUUID(),
    now = await databaseTime(db),
    completed = options.content !== undefined,
    status = completed ? "completed" : "running",
    sequence = options.sequence ?? 1;
  await db.execute(
    sql`insert into turns(id,conversation_id,client_submission_id,sequence,normalized_question,question_digest,normalization_version,status,current_attempt_id,created_at,updated_at) values(${turn},${conversationId},${randomUUID()},${sequence},'Fixture',${digest("Fixture")},'v1',${status},${options.wrongCurrent ?? attempt},${now},${now})`,
  );
  await db.execute(
    sql`insert into attempts(id,turn_id,number,status,started_at,deadline_at,finished_at,context_revision,context_through_sequence,context_digest,milestone,run_manifest) values(${attempt},${turn},1,${status},${now},${new Date(now.getTime() + 60000)},${completed ? now : null},0,${sequence},${digest("fixture")},1,'{}'::jsonb)`,
  );
  if (!options.missingUser)
    await db.execute(
      sql`insert into messages(id,turn_id,role,user_text,created_at) values(${randomUUID()},${turn},'user','Fixture',${now})`,
    );
  if (completed)
    await db.execute(
      sql`insert into messages(id,turn_id,role,attempt_id,content,response_kind,content_schema_version,created_at) values(${randomUUID()},${turn},'assistant',${attempt},${JSON.stringify(options.content)}::jsonb,'answer','v1',${now})`,
    );
  return attempt;
}
