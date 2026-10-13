import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
// A running Next server retains old asset names when .next is overwritten.
// Refuse that local workflow rather than leaving the visitor page unstyled.
let local;
try {
  local = JSON.parse(await readFile(".tmp/local/app.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (
  local?.project === "ai-nutrition-asst" &&
  Number.isInteger(local.port) &&
  local.port > 0 &&
  local.port <= 65535
) {
  let running = false;
  try {
    const response = await fetch(
      `http://127.0.0.1:${local.port}/api/v1/health/live`,
      { signal: AbortSignal.timeout(2000) },
    );
    running = response.ok;
    await response.body?.cancel();
  } catch {
    // No reachable local app; normal offline builds can proceed.
  }
  if (running) {
    console.error(
      "Stop this project's local app before building, then restart it with npm run dev. Rebuilding a running app can break its CSS and JavaScript. Keep .tmp/local/ to preserve chats.",
    );
    process.exit(1);
  }
}
// Next must not load developer .env credentials while compiling browser/server bundles.
const env = Object.fromEntries(
  [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "HOME",
    "USERPROFILE",
    "USERNAME",
    "USERDOMAIN",
    "TEMP",
    "TMP",
  ]
    .filter((k) => process.env[k] !== undefined)
    .map((k) => [k, process.env[k]]),
);
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", "--webpack"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...env,
      __NEXT_PROCESSED_ENV: "true",
      GROQ_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
process.exitCode = result.status ?? 1;
