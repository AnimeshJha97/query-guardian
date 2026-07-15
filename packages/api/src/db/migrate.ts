import { pool } from "./client.js";
import { runMigrations } from "./runMigrations.js";

async function main() {
  console.log("Running migrations against QG_METADATA_DATABASE_URL...");
  await runMigrations();
  console.log("Migrations complete.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
