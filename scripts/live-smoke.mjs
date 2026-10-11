import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import pg from "pg";
import { startCluster, child, exited, freePort, waitFor } from "./postgres.mjs";
import { migrate } from "./migration-lib.mjs";
const secrets = parseEnv(await readFile(".env", "utf8"));
const maxCalls = Number(process.env.LIVE_MAX_CALLS ?? 20),
  maxTokens = Number(process.env.LIVE_MAX_TOKENS ?? 40000);
if (
  !Number.isInteger(maxCalls) ||
  maxCalls < 1 ||
  maxCalls > 20 ||
  !Number.isInteger(maxTokens) ||
  maxTokens < 1 ||
  maxTokens > 40000
)
  throw new Error("Invalid live-run cap");
if (!secrets.GROQ_API_KEY?.trim())
  throw new Error("Configure GROQ_API_KEY in ignored .env");
const run = randomUUID().replaceAll("-", ""),
  name = `nutribite_smoke_${run}`,
  role = `smoke_${run}`,
  directory = resolve(".tmp/live", run);
await mkdir(directory, { recursive: true });
const manifest = {
  run,
  purpose:
    "Phase 2 adapter compatibility and API smoke; not Phase 3 evaluation",
  created_at: new Date().toISOString(),
  max_calls: maxCalls,
  max_total_tokens: maxTokens,
  account_limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  reviewer:
    "Codex: contract, safety-route and persistence checks only; human factual/accessibility review remains pending",
  artifacts:
    "Synthetic accepted outputs and allowlisted metadata only; no secrets, hidden reasoning, raw errors or rejected candidates. Private ignored .tmp/live; preserve adverse observations.",
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  dirty:
    execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim().length > 0,
  source_hash: createHash("sha256")
    .update(await readFile("src/server/llm/settings.ts"))
    .digest("hex"),
};
await writeFile(
  resolve(directory, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  { flag: "wx", mode: 0o600 },
);
await writeFile(
  resolve(directory, "owner.json"),
  JSON.stringify({ name, run }),
  { flag: "wx" },
);
const cluster = await startCluster(resolve(directory, "cluster"));
let admin,
  server,
  created = false,
  url;
try {
  admin = new pg.Client({ connectionString: cluster.url });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  url = new URL(cluster.url);
  url.pathname = `/${name}`;
  await migrate(url.toString());
  const password = randomBytes(24).toString("hex");
  await admin.query(
    `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
  );
  const grant = new pg.Client({ connectionString: url.toString() });
  await grant.connect();
  try {
    await grant.query(
      `CREATE SCHEMA harness; CREATE TABLE harness.owner(run_id text NOT NULL); INSERT INTO harness.owner VALUES('${run}'); REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"; REVOKE INSERT,UPDATE,DELETE ON schema_migrations FROM "${role}"; REVOKE INSERT,DELETE ON generation_slots FROM "${role}"`,
    );
  } finally {
    await grant.end();
  }
  const runtimeUrl = new URL(url);
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  const port = await freePort(),
    origin = `http://127.0.0.1:${port}`;
  const base = Object.fromEntries(
    [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "HOME",
      "USERPROFILE",
      "USERNAME",
      "USERDOMAIN",
    ]
      .filter((k) => process.env[k] !== undefined)
      .map((k) => [k, process.env[k]]),
  );
  const env = {
    ...base,
    TEMP: directory,
    TMP: directory,
    APP_ENV: "local",
    APP_ORIGIN: origin,
    PROVIDER_MODE: "groq",
    GROQ_API_KEY: secrets.GROQ_API_KEY,
    GROQ_DAILY_CALL_LIMIT: String(maxCalls),
    GROQ_DAILY_TOKEN_LIMIT: String(maxTokens),
    DATABASE_URL: runtimeUrl.toString(),
    CSRF_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64url") }),
    CSRF_ACTIVE_KEY: "v1",
    QUOTA_KEY: randomBytes(32).toString("base64url"),
    QUOTA_KEY_VERSION: "v1",
    GENERATION_ENABLED: "true",
    BUILD_ID: manifest.commit.slice(0, 12) + "-phase2-dirty",
    __NEXT_PROCESSED_ENV: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    LIVE_ARTIFACT_DIR: directory,
  };
  // The app and probes share the same durable account-budget ledger and 20/40k cap.
  server = child(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env },
  );
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});
  await waitFor(async () => {
    const r = await fetch(origin + "/api/v1/health/ready", {
      signal: AbortSignal.timeout(1000),
    });
    return r.status === 200;
  }, 60000);
  const entry = resolve(directory, "runner.mjs");
  await build({
    entryPoints: ["scripts/live-smoke.ts"],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    target: "node24",
    logLevel: "silent",
  });
  console.info(
    `Live smoke ${run}: capped at ${maxCalls} calls / ${maxTokens} total tokens; synthetic data only.`,
  );
  const runner = child(process.execPath, ["--conditions=react-server", entry], {
    env,
    stdio: "inherit",
  });
  const code = await exited(runner);
  if (code) process.exitCode = code;
} finally {
  if (server?.exitCode === null) {
    server.kill();
    await exited(server);
  }
  if (created && url) {
    const check = new pg.Client({ connectionString: url.toString() });
    await check.connect();
    let owned = false;
    try {
      const r = await check.query("SELECT run_id FROM harness.owner");
      const marker = JSON.parse(
        await readFile(resolve(directory, "owner.json"), "utf8"),
      );
      owned =
        r.rows.length === 1 &&
        r.rows[0].run_id === run &&
        marker.run === run &&
        marker.name === name;
    } finally {
      await check.end();
    }
    if (!owned) {
      console.error("Smoke cleanup ownership mismatch; database retained.");
      process.exitCode = 1;
    } else {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.query(`DROP ROLE "${role}"`);
    }
  }
  if (admin) await admin.end();
  await cluster.stop();
  console.info(`Stopped owned smoke resources. Evidence: .tmp/live/${run}`);
}
