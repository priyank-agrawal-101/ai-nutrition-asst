import { readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
const mode = process.argv[2];
if (!["on", "off", "status", "purge"].includes(mode))
  throw Error(
    "Use diagnostics:on, diagnostics:off, diagnostics:status or diagnostics:purge",
  );
const marker = resolve(".tmp/local/diagnostics.enabled.json");
const settings = JSON.parse(
  await readFile(resolve(".tmp/local/app.json"), "utf8"),
);
if (settings.project !== "ai-nutrition-asst")
  throw Error("Local project ownership mismatch");
if (mode === "on") {
  const expires_at = new Date(Date.now() + 86400000).toISOString();
  await writeFile(
    marker,
    JSON.stringify({ project: "ai-nutrition-asst", expires_at }) + "\n",
    { mode: 0o600 },
  );
  console.info(
    `Local diagnostic capture enabled until ${expires_at}. Reload the chat to update its notice. Rejected content stays private in model_diagnostics; no model call was made.`,
  );
} else if (mode === "off") {
  await unlink(marker).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  console.info(
    "Local diagnostic capture off. Existing captures still expire; use diagnostics:purge to remove them now.",
  );
} else {
  const owner = JSON.parse(
    await readFile(resolve(".tmp/local/cluster/owner.json"), "utf8"),
  );
  if (owner.project !== "ai-nutrition-asst")
    throw Error("Local database ownership mismatch");
  const db = new pg.Client({
    host: "127.0.0.1",
    port: owner.port,
    database: "nutribite_local",
    user: "nutribite_local_runtime",
    password: settings.runtimePassword,
    connectionTimeoutMillis: 3000,
  });
  try {
    await db.connect();
    await db.query("BEGIN");
    await db.query("select pg_advisory_xact_lock(713293)");
    const removed = await db.query(
      mode === "purge"
        ? "delete from model_diagnostics"
        : "delete from model_diagnostics where expires_at<=clock_timestamp()",
    );
    const result = await db.query(
      "select count(*)::int as records,min(expires_at) as next_expiry from model_diagnostics",
    );
    await db.query("COMMIT");
    let expires = null;
    try {
      const value = JSON.parse(await readFile(marker, "utf8"));
      if (
        value.project === "ai-nutrition-asst" &&
        Date.parse(value.expires_at) > Date.now() &&
        Date.parse(value.expires_at) - Date.now() <= 86400000
      )
        expires = value.expires_at;
    } catch {
      /* disabled */
    }
    console.info(
      JSON.stringify({
        capture_enabled: expires !== null,
        capture_until: expires,
        removed: removed.rowCount,
        ...result.rows[0],
      }),
    );
  } catch {
    await db.query("ROLLBACK").catch(() => {});
    throw Error(
      "Could not inspect local diagnostics. Start the upgraded local app and try again.",
    );
  } finally {
    await db.end();
  }
}
