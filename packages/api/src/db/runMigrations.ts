import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./client.js";

/**
 * Applies pending drizzle migrations. Runs automatically on API startup
 * (see server.ts) so `docker compose up` needs no manual migrate step;
 * also invoked by the `db:migrate` CLI script.
 *
 * The folder is resolved relative to this module — not process.cwd() —
 * so it works both in dev (tsx from packages/api) and in the container
 * (node packages/api/dist/... with cwd /app).
 */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  await migrate(db, { migrationsFolder });
}
