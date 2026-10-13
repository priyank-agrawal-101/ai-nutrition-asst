import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { access } from "node:fs/promises";
import pg from "pg";
import { sql } from "drizzle-orm";
import { Database } from "../../src/server/db/connection";
import { establish } from "../../src/server/security";
import { loadConfig } from "../../src/server/config";
import { TurnService } from "../../src/server/turn-service";
import { maintenance } from "../../src/server/maintenance";
import { configEnv } from "../support/config";
import {
  ScriptedProvider,
  allow,
  answer,
  review,
} from "../support/scripted-provider";

it("EC-DATA-10 EC-OPS-11 restores a real archive, denies resurrected sessions and purges before reopening", async () => {
  if (
    !process.env.TEST_RUN_ID ||
    !process.env.TEST_MIGRATION_DATABASE_URL ||
    !process.env.TEST_DATABASE_URL
  )
    throw new Error("Use the isolated restore harness");
  const binary = (name: string) =>
    process.env.POSTGRES_TOOLS_DIR
      ? join(
          process.env.POSTGRES_TOOLS_DIR,
          name + (process.platform === "win32" ? ".exe" : ""),
        )
      : name;
  const execute = promisify(execFile);
  for (const tool of ["pg_dump", "pg_restore"]) {
    const { stdout } = await execute(binary(tool), ["--version"], {
      windowsHide: true,
    });
    expect(stdout).toMatch(/\(PostgreSQL\) 17\./);
  }
  const source = new URL(process.env.TEST_MIGRATION_DATABASE_URL);
  const name = `nutribite_restore_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: source.toString() });
  const db = new Database(process.env.TEST_DATABASE_URL);
  const sourceAdmin = new Database(source.toString());
  const config = loadConfig(configEnv());
  const network = randomUUID();
  const { session } = await establish(db, config, null, network);
  const provider = new ScriptedProvider([allow(), answer(), review()]);
  const service = new TurnService(db, config, provider);
  const { conversation } = await service.create(
    session.id,
    randomUUID(),
    network,
  );
  await service.submit(
    session.id,
    conversation.id,
    randomUUID(),
    "Synthetic restore rehearsal",
    network,
  );
  provider.done();
  const archive = resolve(process.env.TEMP!, "synthetic-backup.dump");
  const env = {
    ...process.env,
    PGHOST: source.hostname,
    PGPORT: source.port,
    PGUSER: decodeURIComponent(source.username),
    PGPASSWORD: decodeURIComponent(source.password),
  };
  let created = false;
  let restored: Database | undefined;
  try {
    await admin.connect();
    await execute(
      binary("pg_dump"),
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        archive,
        "--dbname",
        source.pathname.slice(1),
      ],
      { env, windowsHide: true },
    );
    await access(archive);
    // Revocation after the recovery point is deliberately absent from the archive.
    await sourceAdmin.db.execute(
      sql`update sessions set revoked_at=clock_timestamp() where id=${session.id}`,
    );
    await expect(
      service.read(session.id, conversation.id),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await execute(
      binary("pg_restore"),
      ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", name, archive],
      { env, windowsHide: true },
    );
    const target = new URL(source);
    target.pathname = `/${name}`;
    restored = new Database(target.toString());
    const marker = await restored.pool.query<{ n: number }>(
      "select run_id from harness.owner",
    );
    expect(marker.rows).toEqual([{ run_id: process.env.TEST_RUN_ID }]);
    const restoredProvider = new ScriptedProvider([]);
    const restoredService = new TurnService(restored, config, restoredProvider);
    const history = await restoredService.read(session.id, conversation.id);
    expect(history.turns[0]?.assistant_message?.content.answer).toBeTruthy();
    // No public app is started on this copy. Conservative recovery revokes ALL
    // restored sessions before cleanup, including post-backup revocations.
    await restored.db.execute(
      sql`update sessions set revoked_at=coalesce(revoked_at,clock_timestamp())`,
    );
    await expect(
      restoredService.read(session.id, conversation.id),
    ).rejects.toMatchObject({ code: "SESSION_UNAVAILABLE" });
    await maintenance(restored, restoredService, () => {});
    await maintenance(restored, restoredService, () => {});
    for (const table of [
      "sessions",
      "conversations",
      "turns",
      "attempts",
      "messages",
      "provider_calls",
      "model_diagnostics",
    ])
      expect(
        (
          await restored.pool.query<{ n: number }>(
            `select count(*)::int n from ${table}`,
          )
        ).rows[0]?.n,
      ).toBe(0);
    expect(
      (
        await restored.pool.query<{ n: number }>(
          "select count(*)::int n from schema_migrations",
        )
      ).rows[0]?.n,
    ).toBeGreaterThan(0);
    expect(
      (
        await restored.pool.query<{ n: number }>(
          "select count(*)::int n from generation_slots where attempt_id is not null",
        )
      ).rows[0]?.n,
    ).toBe(0);
    expect(
      (
        await sourceAdmin.pool.query<{ n: number }>(
          "select count(*)::int n from messages",
        )
      ).rows[0]?.n,
    ).toBe(2);
    restoredProvider.done();
  } finally {
    await restored?.close();
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    await db.close();
    await sourceAdmin.close();
  }
});
