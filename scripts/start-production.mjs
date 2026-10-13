import { spawn } from "node:child_process";

if (process.env.APP_ENV !== "production" || process.env.APP_ROLE !== "backend")
  throw new Error(
    "Railway startup requires APP_ENV=production and APP_ROLE=backend",
  );
const port = process.env.PORT;
if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error("Railway must supply a valid PORT");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      __NEXT_PROCESSED_ENV: "true",
    },
  },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.kill(signal));
server.on("error", () => {
  console.error("Backend startup failed");
  process.exitCode = 1;
});
server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
