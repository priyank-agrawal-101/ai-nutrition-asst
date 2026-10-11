import { it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import {
  envelope,
  sessionSchema,
  conversationSchema,
  lookupSchema,
  operationSchema,
} from "../../src/contracts/api";
import { z } from "zod";

async function freePort() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No port");
  await new Promise<void>((r) => server.close(() => r()));
  return addr.port;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exit = new Promise<void>((r) => child.once("exit", () => r()));
  child.kill();
  await exit;
}
function event(child: ChildProcess, wanted: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Child never reached ${wanted}`));
    }, 10000);
    function cleanup() {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
    }
    function onMessage(value: unknown) {
      if (z.object({ event: z.literal(wanted) }).safeParse(value).success) {
        cleanup();
        resolve();
      }
    }
    function onExit() {
      cleanup();
      reject(new Error("Owned child exited before barrier"));
    }
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}
it("EC-REQ-04/11 process restart preserves committed history and reconciles orphan without generation", async () => {
  const origin = `http://127.0.0.1:${await freePort()}`;
  let child: ChildProcess | undefined;
  const launch = async (hold: boolean) => {
    const running = spawn(
      process.execPath,
      [
        "--conditions=react-server",
        process.env.TEST_CHILD_ENTRY ?? "missing-test-child",
      ],
      {
        env: {
          ...process.env,
          APP_ORIGIN: origin,
          TEST_HOLD_PROVIDER: String(hold),
        },
        windowsHide: true,
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      },
    );
    await event(running, "ready");
    return running;
  };
  const call = async <T extends z.ZodType>(
    path: string,
    schema: T,
    headers: Record<string, string> = {},
    body?: unknown,
  ) => {
    const response = await fetch(`${origin}/api/v1/${path}`, {
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...headers,
      },
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return envelope(schema).parse((await response.json()) as unknown);
  };
  try {
    child = await launch(false);
    const s = await call("session", sessionSchema, {}, {});
    // The cookie is captured separately because it is deliberately outside the JSON envelope.
    const response = await fetch(`${origin}/api/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
    });
    const boot = envelope(sessionSchema).parse(
      (await response.json()) as unknown,
    );
    if (!("data" in boot) || !("data" in s)) throw new Error("No session");
    const headers = {
      Cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
      "X-CSRF-Token": boot.data.csrf_token,
    };
    const c = await call("conversations", conversationSchema, headers, {
      client_conversation_id: randomUUID(),
    });
    if (!("data" in c)) throw new Error("No conversation");
    const key = randomUUID();
    const saved = await call(
      `conversations/${c.data.id}/turns`,
      operationSchema,
      headers,
      { client_submission_id: key, question: "Stored through restart" },
    );
    expect("data" in saved && saved.data.turn.status).toBe("completed");
    await stop(child);
    child = await launch(true);
    const recovered = await call(
      `conversations/${c.data.id}/submissions/${key}`,
      lookupSchema,
      headers,
    );
    expect("data" in recovered && recovered.data.turn?.status).toBe(
      "completed",
    );
    const pendingKey = randomUUID(),
      started = event(child, "provider_started");
    const pending = call(
      `conversations/${c.data.id}/turns`,
      operationSchema,
      headers,
      {
        client_submission_id: pendingKey,
        question: "Orphaned accepted question",
      },
    ).catch(() => null);
    await started;
    await stop(child);
    await pending;
    child = await launch(false);
    const running = await call(
      `conversations/${c.data.id}/submissions/${pendingKey}`,
      lookupSchema,
      headers,
    );
    if (!("data" in running) || !running.data.turn)
      throw new Error("Orphan missing");
    expect(running.data.turn.status).toBe("running");
    // Real PostgreSQL deadline, no fake JS clock or mutation of immutable attempts.
    const delay =
      new Date(running.data.turn.current_attempt.deadline_at).getTime() -
      Date.now() +
      30;
    await new Promise((r) => setTimeout(r, Math.max(0, delay)));
    const failed = await call(
      `conversations/${c.data.id}/submissions/${pendingKey}`,
      lookupSchema,
      headers,
    );
    expect("data" in failed && failed.data.turn?.failure?.code).toBe(
      "ATTEMPT_TIMEOUT",
    );
    const again = await call(
      `conversations/${c.data.id}`,
      conversationSchema,
      headers,
    );
    expect("data" in again && again.data.turn_count).toBe(2);
    expect(
      "data" in again && again.data.turns[1]?.assistant_message,
    ).toBeNull();
  } finally {
    if (child) await stop(child);
  }
}, 90000);
