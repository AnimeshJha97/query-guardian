import type pg from "pg";
import { fingerprintQuery, type PgStatStatementsRow } from "@query-guardian/core";

const STATS_QUERY = `
  SELECT
    queryid::text,
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    rows,
    shared_blks_hit,
    shared_blks_read,
    temp_blks_written
  FROM pg_stat_statements
  WHERE query NOT ILIKE '%pg_stat_statements%'
  ORDER BY total_exec_time DESC
  LIMIT 500;
`;

export interface PollResult {
  collectedAt: string;
  rows: (PgStatStatementsRow & { normalizedQuery: string; queryHash: string })[];
}

/**
 * Polls pg_stat_statements once and returns fingerprinted rows.
 * Cumulative-vs-delta diffing against the previous poll happens in the
 * caller (it needs the previous snapshot from the metadata store, which
 * this module deliberately doesn't know about — keeps the collector
 * decoupled from storage so it's easy to unit test).
 */
export async function pollOnce(pool: pg.Pool): Promise<PollResult> {
  const { rows } = await pool.query<PgStatStatementsRow>(STATS_QUERY);

  return {
    collectedAt: new Date().toISOString(),
    rows: rows.map((row) => {
      const { normalizedQuery, queryHash } = fingerprintQuery(row.query);
      return { ...row, normalizedQuery, queryHash };
    }),
  };
}

/**
 * Runs `pollOnce` on an interval. Caller supplies `onPoll` to persist
 * results (typically an HTTP call to the api service, or a direct write
 * to the metadata DB if collector and api are colocated).
 */
export function startPolling(
  pool: pg.Pool,
  intervalMs: number,
  onPoll: (result: PollResult) => Promise<void>
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const result = await pollOnce(pool);
      await onPoll(result);
    } catch (err) {
      console.error("[collector] poll failed:", err);
    } finally {
      if (!stopped) setTimeout(tick, intervalMs);
    }
  };

  tick();
  return () => {
    stopped = true;
  };
}
