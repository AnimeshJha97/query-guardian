import pg from "pg";
import { checkTargetPermissions } from "@query-guardian/core";

/**
 * Connection to the DATABASE BEING MONITORED — never Query Guardian's own
 * metadata store. Always via the least-privilege `query_guardian_reader`
 * role described in the setup docs (pg_read_all_stats only, no table
 * SELECT unless the user opts into live EXPLAIN support).
 *
 * TLS is required by default. `sslmode=require` is the floor; production
 * deployments should use `verify-full` with a CA cert.
 */
export function createTargetPool(dsn: string, sslMode: "disable" | "require" | "verify-full") {
  return new pg.Pool({
    connectionString: dsn,
    ssl:
      sslMode === "disable"
        ? false
        : sslMode === "verify-full"
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    // Small pool — the collector polls periodically, it isn't a request-serving app.
    max: 2,
    idleTimeoutMillis: 30_000,
  });
}

/**
 * Checks the grants this collector actually needs, so onboarding can tell
 * the user exactly what's missing instead of failing opaquely later.
 */
export async function checkPermissions(pool: pg.Pool): Promise<{
  canReadStats: boolean;
  canReadStatements: boolean;
  errors: string[];
}> {
  return checkTargetPermissions(pool);
}
