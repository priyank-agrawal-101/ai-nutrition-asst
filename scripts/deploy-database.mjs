import pg from "pg";
import { migrate } from "./migration-lib.mjs";
import { pathToFileURL } from "node:url";

// Dedicated project database only. Never uses the local launcher or dotenv.
export async function deployDatabase(migrationUrl, runtimeUrl) {
  const owner = new URL(migrationUrl),
    runtime = new URL(runtimeUrl);
  if (
    ![owner, runtime].every(
      (u) => u.protocol === "postgresql:" && u.password,
    ) ||
    owner.host !== runtime.host ||
    owner.pathname !== runtime.pathname ||
    runtime.username !== "nutribite_runtime" ||
    owner.username === runtime.username
  )
    throw new Error(
      "Use separate migration/runtime roles on the same dedicated database",
    );
  const admin = new pg.Client({ connectionString: migrationUrl });
  await admin.connect();
  try {
    // Serialise role provisioning across redeploys without changing an existing password.
    await admin.query("SELECT pg_advisory_lock(713296)");
    const role = await admin.query(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname='nutribite_runtime'",
    );
    if (role.rows.length && Object.values(role.rows[0]).some(Boolean))
      throw new Error("Existing runtime role has excessive privileges");
    if (!role.rows.length)
      await admin.query(
        `CREATE ROLE nutribite_runtime LOGIN PASSWORD ${pg.escapeLiteral(decodeURIComponent(runtime.password))} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
    await migrate(migrationUrl);
    await admin.query("BEGIN");
    await admin.query(
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO nutribite_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nutribite_runtime; REVOKE INSERT,UPDATE,DELETE ON schema_migrations FROM nutribite_runtime; REVOKE INSERT,DELETE ON generation_slots FROM nutribite_runtime",
    );
    await admin.query("COMMIT");
  } finally {
    await admin.end();
  }
  const check = new pg.Client({ connectionString: runtimeUrl });
  try {
    await check.connect();
    await check.query("SELECT version FROM schema_migrations");
  } finally {
    await check.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (
    process.env.APP_ENV !== "production" ||
    process.env.APP_ROLE !== "backend" ||
    !process.env.MIGRATION_DATABASE_URL ||
    !process.env.DATABASE_URL
  )
    throw new Error(
      "Backend production deployment requires explicit migration and runtime URLs",
    );
  try {
    await deployDatabase(
      process.env.MIGRATION_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    console.info("Database migrations and restricted runtime access verified.");
  } catch {
    console.error(
      "Database deployment failed. Check database connectivity, role credentials and migration compatibility; credentials are not logged.",
    );
    process.exitCode = 1;
  }
}
