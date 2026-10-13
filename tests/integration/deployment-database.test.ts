import { it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import pg from "pg";

it("EC-OPS-10 EC-OPS-11 provisions restricted deployment access idempotently without changing stored rows", async () => {
  const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
  if (!migrationUrl || !process.env.TEST_RUN_ID)
    throw new Error("Owned test database required");
  const url = new URL(migrationUrl);
  if (!url.pathname.startsWith("/nutribite_test_"))
    throw new Error("Not an owned test database");
  const admin = new pg.Client({ connectionString: migrationUrl });
  await admin.connect();
  let owned = false;
  try {
    const existing = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname='nutribite_runtime'",
    );
    if (existing.rowCount)
      throw new Error("Refusing to adopt an existing deployment role");
    url.username = "nutribite_runtime";
    url.password = randomBytes(24).toString("hex");
    const before = await admin.query(
      "SELECT (SELECT count(*) FROM messages)::int AS messages, (SELECT count(*) FROM conversations)::int AS conversations",
    );
    owned = true;
    for (let i = 0; i < 2; i++)
      await promisify(execFile)(
        process.execPath,
        ["scripts/deploy-database.mjs"],
        {
          windowsHide: true,
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            NODE_ENV: "test",
            APP_ENV: "production",
            APP_ROLE: "backend",
            MIGRATION_DATABASE_URL: migrationUrl,
            DATABASE_URL: url.toString(),
          },
        },
      );
    const after = await admin.query(
      "SELECT (SELECT count(*) FROM messages)::int AS messages, (SELECT count(*) FROM conversations)::int AS conversations",
    );
    expect(after.rows).toEqual(before.rows);
    const runtime = new pg.Client({ connectionString: url.toString() });
    await runtime.connect();
    try {
      expect(
        (await runtime.query("SELECT version FROM schema_migrations")).rows,
      ).toHaveLength(5);
      const privilege = await runtime.query(
        "SELECT has_table_privilege(current_user,'messages','SELECT,INSERT,UPDATE,DELETE') AS messages, has_table_privilege(current_user,'schema_migrations','UPDATE') AS migration_write, has_table_privilege(current_user,'generation_slots','DELETE') AS slot_delete",
      );
      expect(privilege.rows[0]).toEqual({
        messages: true,
        migration_write: false,
        slot_delete: false,
      });
    } finally {
      await runtime.end();
    }
  } finally {
    if (owned) {
      await admin.query("DROP OWNED BY nutribite_runtime");
      await admin.query("DROP ROLE nutribite_runtime");
    }
    await admin.end();
  }
}, 30000);
