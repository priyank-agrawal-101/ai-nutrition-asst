import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
export type Db = NodePgDatabase;
export type TransactionFault = (
  stage: "before_work" | "before_commit" | "after_commit",
  label: string,
) => void | Promise<void>;
export class StorageError extends Error {
  constructor(public readonly outcome: "rolled_back" | "unknown") {
    super("Storage operation unavailable");
  }
}
export class Database {
  readonly pool: Pool;
  readonly db: Db;
  constructor(
    url: string,
    private readonly fault?: TransactionFault,
  ) {
    this.pool = new Pool({
      connectionString: url,
      max: 12,
      connectionTimeoutMillis: 3000,
      statement_timeout: 3000,
      lock_timeout: 1000,
      idle_in_transaction_session_timeout: 5000,
    });
    this.pool.on("error", () => {
      /* A request/readiness probe reports safe availability. */
    });
    this.db = drizzle(this.pool);
  }
  async transaction<T>(
    label: string,
    fn: (db: Db) => Promise<T>,
    snapshot = false,
  ): Promise<T> {
    const client = await this.pool.connect();
    let commitSent = false;
    try {
      await client.query(
        snapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN",
      );
      await this.fault?.("before_work", label);
      const value = await fn(drizzle(client));
      await this.fault?.("before_commit", label);
      commitSent = true;
      await client.query("COMMIT");
      await this.fault?.("after_commit", label);
      return value;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* Preserve commit uncertainty. */
      }
      if (commitSent) throw new StorageError("unknown");
      throw error;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
export async function rows<T extends z.ZodType>(
  db: Db,
  query: SQL,
  schema: T,
): Promise<z.infer<T>[]> {
  const result = await db.execute(query);
  return z.array(schema).parse(result.rows);
}
export const dateValue = z
  .union([z.date(), z.string()])
  .transform((v) => new Date(v).toISOString());
export const intValue = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER));
export async function databaseTime(db: Db): Promise<Date> {
  const [row] = await rows(
    db,
    sql`select clock_timestamp() as time`,
    z.object({ time: dateValue }),
  );
  if (!row) throw new Error("Missing database clock");
  return new Date(row.time);
}
