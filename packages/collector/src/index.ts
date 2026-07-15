import { createServer } from "node:http";
import { pino } from "pino";
import { fingerprintQuery, type ConnectionMode } from "@query-guardian/core";
import { createTargetPool, checkPermissions } from "./targetDb.js";
import { startPolling } from "./poller.js";
import { tailAutoExplainLog } from "./logTail.js";
import { IngestClient, type IngestStatsRow } from "./apiClient.js";

const COLLECTOR_VERSION = "0.1.0";
const TARGET_DSN = requireEnv("QG_TARGET_DATABASE_URL");
const SSL_MODE = (process.env.QG_TARGET_SSL_MODE as "disable" | "require" | "verify-full") ?? "verify-full";
const CONNECTION_MODE = (process.env.QG_CONNECTION_MODE ?? "both") as ConnectionMode;
const POLL_INTERVAL_MS = Number(process.env.QG_POLL_INTERVAL_MS ?? 30_000);
const API_INGEST_URL = process.env.QG_API_INGEST_URL ?? "http://api:4000/api/ingest";
const API_TOKEN = process.env.QG_API_TOKEN ?? "";
const DATABASE_NAME = process.env.QG_DATABASE_NAME ?? "demo";
const AUTO_EXPLAIN_LOG_PATH = process.env.QG_AUTO_EXPLAIN_LOG_PATH ?? "/var/lib/postgresql/log/postgresql.json";
const AUTO_EXPLAIN_DATABASE = process.env.QG_AUTO_EXPLAIN_DATABASE;
const HEALTH_PORT = Number(process.env.QG_HEALTH_PORT ?? 4100);
const log = pino({ level: process.env.QG_LOG_LEVEL ?? "info" });

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is required but not set.`);
  return val;
}

function toStatsRow(row: {
  normalizedQuery: string; queryHash: string; calls: number | string;
  total_exec_time: number | string; mean_exec_time: number | string; rows: number | string;
  shared_blks_hit: number | string; shared_blks_read: number | string; temp_blks_written: number | string;
}): IngestStatsRow {
  return {
    queryHash: row.queryHash, normalizedQuery: row.normalizedQuery, calls: Number(row.calls),
    totalExecTimeMs: Number(row.total_exec_time), meanExecTimeMs: Number(row.mean_exec_time),
    rows: Number(row.rows), sharedBlksHit: Number(row.shared_blks_hit),
    sharedBlksRead: Number(row.shared_blks_read), tempBlksWritten: Number(row.temp_blks_written),
  };
}

async function main() {
  if (!API_TOKEN) log.warn("QG_API_TOKEN is not set; ingest requests will be rejected");
  const pool = createTargetPool(TARGET_DSN, SSL_MODE);
  const perms = await checkPermissions(pool);
  if (!perms.canReadStatements) {
    log.error({ errors: perms.errors }, "collector is missing required permissions");
  }

  const client = new IngestClient({
    url: API_INGEST_URL, token: API_TOKEN, databaseName: DATABASE_NAME,
    mode: CONNECTION_MODE, version: COLLECTOR_VERSION,
    log: (message) => log.info({ component: "ingest-client" }, message),
  });

  const healthServer = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") {
      res.statusCode = 200;
      return res.end(JSON.stringify({ status: "ok" }));
    }
    if (req.url === "/ready") {
      try {
        await pool.query("SELECT 1");
        res.statusCode = 200;
        return res.end(JSON.stringify({ status: "ready" }));
      } catch (err) {
        log.warn({ err }, "collector readiness check failed");
        res.statusCode = 503;
        return res.end(JSON.stringify({ status: "not_ready" }));
      }
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  healthServer.listen(HEALTH_PORT, "0.0.0.0", () => log.info({ port: HEALTH_PORT }, "collector health server listening"));

  if (CONNECTION_MODE === "direct" || CONNECTION_MODE === "both") {
    startPolling(pool, POLL_INTERVAL_MS, async (result) => {
      log.info({ rowCount: result.rows.length, collectedAt: result.collectedAt }, "statements polled");
      await client.submitStats(result.collectedAt, result.rows.map(toStatsRow));
    }, log);
  }

  if (CONNECTION_MODE === "log_tail" || CONNECTION_MODE === "both") {
    tailAutoExplainLog(AUTO_EXPLAIN_LOG_PATH, (entry) => {
      if (AUTO_EXPLAIN_DATABASE && entry.database_name !== AUTO_EXPLAIN_DATABASE) return;
      if (!entry.query) return;
      const { normalizedQuery, queryHash } = fingerprintQuery(entry.query);
      log.info({ durationMs: entry.duration_ms, queryPreview: entry.query.slice(0, 80) }, "auto_explain entry received");
      client.submitEvent({
        queryHash, normalizedQuery, occurredAt: entry.timestamp, durationMs: entry.duration_ms,
        source: "auto_explain", backendPid: entry.pid,
        plan: entry.plan != null ? { planJson: { Plan: entry.plan }, planningTimeMs: entry.planning_time_ms,
          executionTimeMs: entry.execution_time_ms } : undefined,
      });
    });
  }

  log.info({ mode: CONNECTION_MODE, pollIntervalMs: POLL_INTERVAL_MS, ingestUrl: API_INGEST_URL,
    databaseName: DATABASE_NAME }, "collector started");
}

main().catch((err) => {
  log.fatal({ err }, "collector fatal error");
  process.exit(1);
});
