import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { startCluster, child, exited, freePort, waitFor } from "./postgres.mjs";
import { migrate } from "./migration-lib.mjs";

const mode = process.argv[2];
if (!["integration", "restore", "browser", "matrix"].includes(mode))
  throw new Error("Choose integration, restore, browser or matrix");
const browserMode = ["browser", "matrix"].includes(mode);
if (browserMode) await access(".next/BUILD_ID");
const projects = ["chromium", "firefox", "webkit", "mobile"];
const project = process.argv[3] ?? "chromium";
if (!projects.includes(project)) throw new Error("Unknown browser project");
if (mode === "matrix") {
  // Each browser is a fresh synthetic visitor population. Reusing one database
  // exhausted the real session quota and obscured browser behavior.
  for (const browser of projects) {
    const runner = child(
      process.execPath,
      ["scripts/test.mjs", "browser", browser],
      { stdio: "inherit" },
    );
    if (await exited(runner)) process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}
const run = randomUUID().replaceAll("-", ""),
  name = `nutribite_test_${run}`,
  runtime = `runtime_${run}`,
  password = randomBytes(24).toString("hex");
const marker = resolve(".tmp", name);
await mkdir(marker, { recursive: true });
await writeFile(resolve(marker, "owner.json"), JSON.stringify({ run, name }), {
  flag: "wx",
});
let cluster, admin, server, dbUrl;
let created = false;
try {
  let bootstrapUrl = process.env.TEST_DATABASE_URL;
  if (!bootstrapUrl) {
    cluster = await startCluster(resolve(marker, "cluster"));
    bootstrapUrl = cluster.url;
  }
  const target = new URL(bootstrapUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
    throw new Error(
      "TEST_DATABASE_URL must identify a dedicated loopback test cluster",
    );
  admin = new pg.Client({ connectionString: bootstrapUrl });
  await admin.connect();
  const version = await admin.query("show server_version_num");
  if (Math.floor(Number(version.rows[0].server_version_num) / 10000) !== 17)
    throw new Error("Tests require PostgreSQL 17");
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  target.pathname = `/${name}`;
  const migrationUrl = target.toString();
  dbUrl = migrationUrl;
  const owned = new pg.Client({ connectionString: migrationUrl });
  await owned.connect();
  try {
    await owned.query("CREATE SCHEMA harness");
    await owned.query("CREATE TABLE harness.owner(run_id text NOT NULL)");
    await owned.query("INSERT INTO harness.owner VALUES($1)", [run]);
  } finally {
    await owned.end();
  }
  await migrate(migrationUrl);
  await admin.query(
    `CREATE ROLE "${runtime}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
  );
  const grants = new pg.Client({ connectionString: migrationUrl });
  await grants.connect();
  try {
    await grants.query(
      `REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO "${runtime}"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${runtime}"; REVOKE INSERT,UPDATE,DELETE ON schema_migrations FROM "${runtime}"; REVOKE INSERT,DELETE ON generation_slots FROM "${runtime}"`,
    );
  } finally {
    await grants.end();
  }
  target.username = runtime;
  target.password = password;
  const runtimeUrl = target.toString(),
    port = await freePort(),
    origin = `http://127.0.0.1:${port}`;
  const childEntry = resolve(marker, "orphan-server.mjs");
  if (mode === "integration")
    await build({
      entryPoints: ["tests/support/orphan-server.ts"],
      outfile: childEntry,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      target: "node24",
      logLevel: "silent",
    });
  // Explicit environment allowlist: no inherited app/provider secrets or .env files.
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    USERNAME: process.env.USERNAME,
    USERDOMAIN: process.env.USERDOMAIN,
    TEMP: resolve(marker),
    TMP: resolve(marker),
    APP_ENV: "test",
    NODE_ENV: "production",
    APP_ORIGIN: origin,
    PROVIDER_MODE: "scripted",
    GROQ_API_KEY: "",
    __NEXT_PROCESSED_ENV: "true",
    DATABASE_URL: runtimeUrl,
    TEST_DATABASE_URL: runtimeUrl,
    TEST_MIGRATION_DATABASE_URL: migrationUrl,
    TEST_RUN_ID: run,
    CSRF_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64url") }),
    CSRF_ACTIVE_KEY: "v1",
    QUOTA_KEY: randomBytes(32).toString("base64url"),
    QUOTA_KEY_VERSION: "v1",
    GENERATION_ENABLED: "true",
    BUILD_ID: "phase1-test-uncommitted",
    NEXT_TELEMETRY_DISABLED: "1",
    PLAYWRIGHT_BROWSERS_PATH: resolve(".cache/playwright"),
    TEST_BASE_URL: origin,
    TEST_CHILD_ENTRY: childEntry,
    POSTGRES_TOOLS_DIR: process.env.POSTGRES_TOOLS_DIR,
  };
  const serverEntry = "node_modules/next/dist/bin/next";
  const start = async () => {
    server = child(
      process.execPath,
      [serverEntry, "start", "--hostname", "127.0.0.1", "--port", String(port)],
      { env },
    );
    server.stdout.on("data", () => {});
    server.stderr.on("data", () => {});
    await waitFor(async () => {
      const response = await fetch(`${origin}/api/v1/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });
      return response.status === 200;
    }, 60000);
  };
  if (browserMode) await start();
  const runner = child(
    process.execPath,
    !browserMode
      ? ["node_modules/vitest/vitest.mjs", "run", "--project", mode]
      : [
          "node_modules/@playwright/test/cli.js",
          "test",
          `--project=${project}`,
        ],
    { env, stdio: "inherit" },
  );
  console.info(
    `Test database ${name}; PostgreSQL 17; isolated scripted provider.`,
  );
  const code = await exited(runner);
  if (code !== 0) process.exitCode = code;
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await exited(server);
  }
  if (admin && created && dbUrl) {
    const owned = new pg.Client({ connectionString: dbUrl });
    await owned.connect();
    let valid = false;
    try {
      const result = await owned.query("SELECT run_id FROM harness.owner");
      const file = JSON.parse(
        await readFile(resolve(marker, "owner.json"), "utf8"),
      );
      valid =
        result.rows.length === 1 &&
        result.rows[0].run_id === run &&
        file.run === run &&
        file.name === name;
    } finally {
      await owned.end();
    }
    assert(valid, "Cleanup ownership check failed");
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS "${runtime}"`);
    console.info(`Cleaned only owned database ${name}.`);
  }
  if (admin) await admin.end();
  if (cluster) await cluster.stop();
}
