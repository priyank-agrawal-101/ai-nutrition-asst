import { migrate } from "./migration-lib.mjs";
const url = process.env.MIGRATION_DATABASE_URL;
if (!url)
  throw new Error(
    "MIGRATION_DATABASE_URL is required; runtime credentials are never used for migrations",
  );
await migrate(url);
console.info("Migration checksum verified and applied.");
