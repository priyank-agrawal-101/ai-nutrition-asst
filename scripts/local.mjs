import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { startCluster, child, exited, freePort } from "./postgres.mjs";
import { migrate } from "./migration-lib.mjs";
const directory = resolve(".tmp/local"),
  settingsPath = resolve(directory, "app.json");
await mkdir(directory, { recursive: true });
let settings;
try {
  settings = JSON.parse(await readFile(settingsPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  settings = {
    project: "ai-nutrition-asst",
    csrf: randomBytes(32).toString("base64url"),
    quota: randomBytes(32).toString("base64url"),
    runtimePassword: randomBytes(24).toString("hex"),
    port: await freePort(),
  };
  await writeFile(settingsPath, JSON.stringify(settings), {
    mode: 0o600,
    flag: "wx",
  });
}
if (settings.project !== "ai-nutrition-asst")
  throw new Error("Local ownership marker mismatch");
const cluster = await startCluster(resolve(directory, "cluster"), true);
let server;
try {
  const admin = new pg.Client({ connectionString: cluster.url });
  await admin.connect();
  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname='nutribite_local'",
    );
    if (!exists.rowCount) await admin.query("CREATE DATABASE nutribite_local");
    const role = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname='nutribite_local_runtime'",
    );
    if (!role.rowCount)
      await admin.query(
        `CREATE ROLE nutribite_local_runtime LOGIN PASSWORD '${settings.runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
  } finally {
    await admin.end();
  }
  const url = new URL(cluster.url);
  url.pathname = "/nutribite_local";
  await migrate(url.toString());
  const grant = new pg.Client({ connectionString: url.toString() });
  await grant.connect();
  try {
    await grant.query(
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO nutribite_local_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nutribite_local_runtime; REVOKE INSERT,UPDATE,DELETE ON schema_migrations FROM nutribite_local_runtime; REVOKE INSERT,DELETE ON generation_slots FROM nutribite_local_runtime",
    );
  } finally {
    await grant.end();
  }
  url.username = "nutribite_local_runtime";
  url.password = settings.runtimePassword;
  const origin = `http://127.0.0.1:${settings.port}`;
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    USERNAME: process.env.USERNAME,
    USERDOMAIN: process.env.USERDOMAIN,
    TEMP: directory,
    TMP: directory,
    APP_ENV: "local",
    APP_ORIGIN: origin,
    PROVIDER_MODE: "scripted",
    DATABASE_URL: url.toString(),
    CSRF_KEYS: JSON.stringify({ v1: settings.csrf }),
    CSRF_ACTIVE_KEY: "v1",
    QUOTA_KEY: settings.quota,
    QUOTA_KEY_VERSION: "v1",
    GENERATION_ENABLED: "true",
    BUILD_ID: "local-uncommitted",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  console.info(
    `Gusto NutriBite local scripted mode: ${origin}\nData stays in .tmp/local. Ctrl+C stops only this app and its database.`,
  );
  // Production build avoids a development worker tree and never binds a public interface.
  server = child(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(settings.port),
    ],
    { env, stdio: "inherit" },
  );
  const stop = () => {
    if (server?.exitCode === null) server.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const code = await exited(server);
  if (code) process.exitCode = code;
} finally {
  if (server?.exitCode === null) {
    server.kill();
    await exited(server);
  }
  await cluster.stop();
}
