import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import pg from "pg";
import { startCluster, child, exited, freePort, waitFor } from "./postgres.mjs";
import { migrate } from "./migration-lib.mjs";
const secrets = parseEnv(await readFile(".env", "utf8"));
// Deliberate paid evaluation only: never assume the previous run's allocation.
const maxCalls = Number(process.env.LIVE_MAX_CALLS),
  maxTokens = Number(process.env.LIVE_MAX_TOKENS);
if (
  !Number.isInteger(maxCalls) ||
  maxCalls < 1 ||
  maxCalls > 180 ||
  !Number.isInteger(maxTokens) ||
  maxTokens < 1 ||
  maxTokens > 135000
)
  throw new Error(
    "Set an explicit LIVE_MAX_CALLS/LIVE_MAX_TOKENS allocation (up to 180/135000)",
  );
function privatePath(value) {
  const root = resolve(".tmp");
  const path = resolve(value ?? "");
  if (!path.startsWith(root + "/") && !path.startsWith(root + "\\"))
    throw new Error(
      "Evaluation inputs must be private files inside this project's .tmp",
    );
  return path;
}
const priorFile = privatePath(process.env.LIVE_PRIOR_USAGE_FILE);
const baselineFile = privatePath(process.env.LIVE_BASELINE_PROMPTS_FILE);
const prior = JSON.parse(await readFile(priorFile, "utf8"));
const priorTokens = [prior.local, ...prior.old.flatMap((r) => r.budget)].map(
  (b) => b.charged_tokens,
);
const priorCalls = [prior.local, ...prior.old.flatMap((r) => r.budget)].map(
  (b) => b.calls,
);
const snapshotAge = Date.now() - Date.parse(prior.at);
// Keep a quarter of the daily allowance available for the owner's chats.
// Tests may use only the remainder; do not drain the interactive allowance.
const interactiveTokenReserve = 50000;
if (
  !Number.isFinite(snapshotAge) ||
  snapshotAge < 0 ||
  snapshotAge > 3600000 ||
  priorTokens.some((n) => !Number.isSafeInteger(n) || n < 0) ||
  priorTokens.reduce((n, v) => n + v, 0) + maxTokens + interactiveTokenReserve >
    200000 ||
  priorCalls.some((n) => !Number.isSafeInteger(n) || n < 0) ||
  priorCalls.reduce((n, v) => n + v, 0) + maxCalls > 1000
)
  throw new Error(
    "Refresh prior usage and choose a test allocation that leaves 50000 tokens for chat within the 1000-call/200000-token daily limits",
  );
try {
  await access(resolve(".tmp/local/generation.disabled"));
  throw new Error(
    "The local shutdown marker also disables evaluation; stop the visitor app and clear the marker first",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!secrets.GROQ_API_KEY?.trim())
  throw new Error("Configure GROQ_API_KEY in ignored .env");
const run = randomUUID().replaceAll("-", ""),
  name = `nutribite_regression_${run}`,
  role = `regression_${run}`,
  directory = resolve(".tmp/live", run);
await mkdir(directory, { recursive: true });
const manifest = {
  run,
  purpose:
    "Classifier v2 regression: fixed 39 turns, adopted policy extensions and old/new synthetic classifier probes; independent factual review remains pending",
  created_at: new Date().toISOString(),
  build_id: (await readFile(".next/BUILD_ID", "utf8")).trim(),
  max_calls: maxCalls,
  max_total_tokens: maxTokens,
  interactive_token_reserve: interactiveTokenReserve,
  account_limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  reviewer:
    "Codex: contract, safety-route and persistence checks only; human factual/accessibility review remains pending",
  artifacts:
    "Synthetic accepted outputs, bounded rejected candidate content and allowlisted metadata; no secrets, hidden reasoning or raw HTTP errors. Private ignored .tmp/live; preserve adverse observations. No visitor messages.",
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
await writeFile(
  resolve(directory, "prior-usage.json"),
  await readFile(priorFile),
);
await writeFile(
  resolve(directory, "old-prompts.json"),
  await readFile(baselineFile),
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
    BUILD_ID: manifest.build_id,
    __NEXT_PROCESSED_ENV: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    LIVE_ARTIFACT_DIR: directory,
  };
  // Isolated app and probes share the same durable ledger; local visitor app is stopped.
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
    entryPoints: ["scripts/live-regression.ts"],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    target: "node24",
    logLevel: "silent",
  });
  console.info(
    `Live regression ${run}: capped at ${maxCalls} calls / ${maxTokens} total tokens; synthetic data only.`,
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
      console.error(
        "Regression cleanup ownership mismatch; database retained.",
      );
      process.exitCode = 1;
    } else {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.query(`DROP ROLE "${role}"`);
    }
  }
  if (admin) await admin.end();
  await cluster.stop();
  console.info(
    `Stopped owned regression resources. Evidence: .tmp/live/${run}`,
  );
}
