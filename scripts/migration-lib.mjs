import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
export async function migrate(url) {
  const manifest = JSON.parse(
    await readFile(
      new URL("../src/server/db/migration-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(713291)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())",
    );
    for (const entry of manifest.migrations) {
      if (!/^\d{4}_[a-z_]+$/.test(entry.version))
        throw new Error("Invalid migration version");
      const migration = await readFile(
        new URL(`../migrations/${entry.version}.sql`, import.meta.url),
        "utf8",
      );
      const checksum = createHash("sha256").update(migration).digest("hex");
      if (checksum !== entry.checksum)
        throw new Error("Migration manifest mismatch");
      const prior = await db.query(
        "SELECT checksum FROM schema_migrations WHERE version=$1",
        [entry.version],
      );
      if (prior.rows.length) {
        if (prior.rows[0].checksum !== checksum)
          throw new Error("Applied migration changed");
      } else {
        await db.query(migration);
        await db.query(
          "INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)",
          [entry.version, checksum],
        );
      }
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}
