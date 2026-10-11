import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
export async function migrate(url) {
  const migration = await readFile(
      new URL("../migrations/0001_foundation.sql", import.meta.url),
      "utf8",
    ),
    checksum = createHash("sha256").update(migration).digest("hex");
  const manifest = JSON.parse(
    await readFile(
      new URL("../src/server/db/migration-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  if (checksum !== manifest.checksum)
    throw new Error("Migration manifest mismatch");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(713291)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())",
    );
    const prior = await db.query(
      "SELECT checksum FROM schema_migrations WHERE version='0001_foundation'",
    );
    if (prior.rows.length) {
      if (prior.rows[0].checksum !== checksum)
        throw new Error("Applied migration changed");
    } else {
      await db.query(migration);
      await db.query(
        "INSERT INTO schema_migrations(version,checksum) VALUES('0001_foundation',$1)",
        [checksum],
      );
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}
