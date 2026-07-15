import type { FastifyBaseLogger } from "fastify";
import { pool } from "../db/client.js";

export interface RollupResult {
  daysRolledUp: number;
  snapshotsDeleted: number;
}

export async function rollupOldSnapshots(retentionDays = positiveNumberEnv("QG_RAW_RETENTION_DAYS", 7)): Promise<RollupResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cutoff = await client.query<{ cutoff: Date }>(
      "SELECT date_trunc('day', now() - ($1::int * interval '1 day')) AS cutoff",
      [retentionDays]
    );
    const cutoffDate = cutoff.rows[0].cutoff;
    const rolledUp = await client.query(
      `INSERT INTO query_stats_daily_rollups (
         fingerprint_id, bucket_date, snapshot_count, first_collected_at, last_collected_at,
         first_calls, last_calls, first_total_exec_time_ms, last_total_exec_time_ms,
         first_rows, last_rows, avg_mean_exec_time_ms, last_shared_blks_hit,
         last_shared_blks_read, last_temp_blks_written
       )
       SELECT fingerprint_id, collected_at::date, count(*)::int, min(collected_at), max(collected_at),
         (array_agg(calls ORDER BY collected_at))[1], (array_agg(calls ORDER BY collected_at DESC))[1],
         (array_agg(total_exec_time_ms ORDER BY collected_at))[1],
         (array_agg(total_exec_time_ms ORDER BY collected_at DESC))[1],
         (array_agg(rows ORDER BY collected_at))[1], (array_agg(rows ORDER BY collected_at DESC))[1],
         avg(mean_exec_time_ms), (array_agg(shared_blks_hit ORDER BY collected_at DESC))[1],
         (array_agg(shared_blks_read ORDER BY collected_at DESC))[1],
         (array_agg(temp_blks_written ORDER BY collected_at DESC))[1]
       FROM query_stats_snapshots WHERE collected_at < $1
       GROUP BY fingerprint_id, collected_at::date
       ON CONFLICT (fingerprint_id, bucket_date) DO UPDATE SET
         snapshot_count = EXCLUDED.snapshot_count, first_collected_at = EXCLUDED.first_collected_at,
         last_collected_at = EXCLUDED.last_collected_at, first_calls = EXCLUDED.first_calls,
         last_calls = EXCLUDED.last_calls, first_total_exec_time_ms = EXCLUDED.first_total_exec_time_ms,
         last_total_exec_time_ms = EXCLUDED.last_total_exec_time_ms, first_rows = EXCLUDED.first_rows,
         last_rows = EXCLUDED.last_rows, avg_mean_exec_time_ms = EXCLUDED.avg_mean_exec_time_ms,
         last_shared_blks_hit = EXCLUDED.last_shared_blks_hit,
         last_shared_blks_read = EXCLUDED.last_shared_blks_read,
         last_temp_blks_written = EXCLUDED.last_temp_blks_written
       RETURNING id`,
      [cutoffDate]
    );
    const deleted = await client.query("DELETE FROM query_stats_snapshots WHERE collected_at < $1 RETURNING id", [cutoffDate]);
    await client.query("COMMIT");
    return { daysRolledUp: rolledUp.rowCount ?? 0, snapshotsDeleted: deleted.rowCount ?? 0 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function startSnapshotRollupJob(log: FastifyBaseLogger): () => void {
  const intervalMs = positiveNumberEnv("QG_ROLLUP_INTERVAL_MS", 3_600_000);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await rollupOldSnapshots();
      log.info({ result }, "snapshot rollup job completed");
    } catch (err) {
      log.error({ err }, "snapshot rollup job failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), intervalMs);
  void run();
  return () => clearInterval(timer);
}

function positiveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
