import { createServer } from "node:http";
import { Readable } from "node:stream";
import { loadConfig } from "../../src/server/config";
import { Database } from "../../src/server/db/connection";
import { TurnService } from "../../src/server/turn-service";
import { createHandler } from "../../src/server/http";
import {
  LocalScriptedProvider,
  type Provider,
  type Phase,
  type ProviderResult,
} from "../../src/server/provider";
import { maintenance } from "../../src/server/maintenance";
const config = loadConfig(process.env),
  db = new Database(config.databaseUrl);
// Constructor seam only in the test child; never reachable via public requests.
const local = new LocalScriptedProvider();
const provider: Provider = {
  call(
    phase: Phase,
    context: string,
    candidate: string | null,
    signal: AbortSignal,
  ): Promise<ProviderResult> {
    if (process.env.TEST_HOLD_PROVIDER === "true") {
      process.send?.({ event: "provider_started" });
      return new Promise(() => {});
    }
    return local.call(phase, context, candidate, signal);
  },
};
const turns = new TurnService(db, config, provider),
  handler = createHandler(db, config, turns, () => {});
await maintenance(db, turns, () => {});
const server = createServer((req, res) => {
  void (async () => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const body = req.method === "GET" ? undefined : Readable.toWeb(req);
    const response = await handler(
      new Request(`${config.origin}${req.url}`, {
        method: req.method ?? "GET",
        headers,
        ...(body ? { body, duplex: "half" } : {}),
      } as RequestInit),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  })().catch(() => {
    res.writeHead(500);
    res.end();
  });
});
server.listen(Number(new URL(config.origin).port), "127.0.0.1", () =>
  process.send?.({ event: "ready" }),
);
