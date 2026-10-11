import { spawnSync } from "node:child_process";
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
