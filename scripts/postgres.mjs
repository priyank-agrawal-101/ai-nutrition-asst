import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile, unlink, access } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
import getBinaries from "../node_modules/embedded-postgres/dist/binary.js";

export async function freePort() {
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Port unavailable");
  await new Promise((ok) => server.close(ok));
  return address.port;
}
export function child(command, args, options = {}) {
  return spawn(command, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}
export async function exited(process) {
  if (process.exitCode !== null) return process.exitCode;
  return new Promise((ok, fail) => {
    process.once("error", fail);
    process.once("exit", (code) => ok(code ?? 1));
  });
}
export async function waitFor(check, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* bounded startup probe */
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error("Owned service failed to become ready");
}
export async function startCluster(directory, persistent = false) {
  const root = resolve(".tmp"),
    dir = resolve(directory);
  if (!dir.startsWith(root + "\\") && !dir.startsWith(root + "/"))
    throw new Error("Cluster must be inside project .tmp");
  await mkdir(dir, { recursive: true });
  const credentialsPath = resolve(dir, "owner.json");
  let owner;
  try {
    owner = JSON.parse(await readFile(credentialsPath, "utf8"));
    if (owner.project !== "ai-nutrition-asst" || !persistent)
      throw new Error("Refusing to adopt an existing cluster");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    owner = {
      project: "ai-nutrition-asst",
      password: randomBytes(32).toString("hex"),
      port: await freePort(),
    };
    await writeFile(credentialsPath, JSON.stringify(owner), {
      mode: 0o600,
      flag: "wx",
    });
  }
  const bin = await getBinaries(),
    data = resolve(dir, "data");
  let initialized = false;
  try {
    await access(resolve(data, "PG_VERSION"));
    initialized = true;
  } catch {
    /* initialize owned cluster */
  }
  if (!initialized) {
    const passwordFile = resolve(dir, "init-password");
    await writeFile(passwordFile, owner.password, { mode: 0o600 });
    try {
      const init = child(bin.initdb, [
        "-D",
        data,
        "-U",
        "nutribite_admin",
        "--auth=scram-sha-256",
        `--pwfile=${passwordFile}`,
        "--encoding=UTF8",
        "--locale=C",
      ]);
      let diagnostic = "";
      init.stderr.on("data", (b) => {
        diagnostic += b.toString();
      });
      if ((await exited(init)) !== 0)
        throw new Error(`Postgres initialization failed: ${diagnostic}`);
    } finally {
      await unlink(passwordFile);
    }
  }
  const server = child(bin.postgres, [
    "-D",
    data,
    "-h",
    "127.0.0.1",
    "-p",
    String(owner.port),
    "-c",
    "log_statement=none",
    "-c",
    "log_min_error_statement=panic",
    "-c",
    "log_error_verbosity=terse",
  ]);
  const url = `postgresql://nutribite_admin:${owner.password}@127.0.0.1:${owner.port}/postgres`;
  try {
    await waitFor(async () => {
      if (server.exitCode !== null) throw new Error("Postgres child exited");
      const client = new pg.Client({
        connectionString: url,
        connectionTimeoutMillis: 500,
      });
      try {
        await client.connect();
        await client.query("select 1");
        return true;
      } finally {
        await client.end();
      }
    });
  } catch (error) {
    if (server.exitCode === null) server.kill();
    throw error;
  }
  return {
    url,
    owner,
    async stop() {
      if (server.exitCode === null) {
        const ctl = resolve(
          bin.postgres,
          "..",
          process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl",
        );
        const stopping = child(ctl, ["-D", data, "-m", "fast", "-w", "stop"]);
        if ((await exited(stopping)) !== 0)
          throw new Error("Owned Postgres did not stop");
        await exited(server);
      }
    },
  };
}
