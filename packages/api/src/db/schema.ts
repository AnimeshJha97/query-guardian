import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  boolean,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Enums -----------------------------------------------------------------

export const connectionModeEnum = pgEnum("connection_mode", ["direct", "log_tail", "both"]);
export const dbStatusEnum = pgEnum("db_status", ["pending", "healthy", "degraded", "error"]);
export const slowQuerySourceEnum = pgEnum("slow_query_source", ["direct_poll", "auto_explain"]);
export const suggestionImpactEnum = pgEnum("suggestion_impact", ["high", "medium", "low"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "applied", "dismissed"]);
export const patternStatusEnum = pgEnum("pattern_status", ["open", "resolved"]);

// --- Tenancy (single row in self-hosted mode) -------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Connections -------------------------------------------------------------

export const monitoredDatabases = pgTable("monitored_databases", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  connectionMode: connectionModeEnum("connection_mode").notNull().default("both"),
  // Encrypted at the application layer before insert; never store plaintext DSNs.
  dsnEncrypted: text("dsn_encrypted").notNull(),
  sslMode: text("ssl_mode").notNull().default("verify-full"),
  status: dbStatusEnum("status").notNull().default("pending"),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collectorAgents = pgTable("collector_agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  databaseId: uuid("database_id").notNull().references(() => monitoredDatabases.id),
  mode: connectionModeEnum("mode").notNull(),
  version: text("version").notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Query identity + time series -------------------------------------------

export const queryFingerprints = pgTable(
  "query_fingerprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    databaseId: uuid("database_id").notNull().references(() => monitoredDatabases.id),
    queryHash: text("query_hash").notNull(),
    normalizedQuery: text("normalized_query").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Ingestion upserts by (databaseId, queryHash) — see routes/ingest.ts.
    dbHashIdx: uniqueIndex("query_fingerprints_db_hash_idx").on(
      table.databaseId,
      table.queryHash
    ),
  })
);

export const queryStatsSnapshots = pgTable(
  "query_stats_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fingerprintId: uuid("fingerprint_id").notNull().references(() => queryFingerprints.id),
    collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow().notNull(),
    calls: integer("calls").notNull(),
    totalExecTimeMs: doublePrecision("total_exec_time_ms").notNull(),
    meanExecTimeMs: doublePrecision("mean_exec_time_ms").notNull(),
    rows: integer("rows").notNull(),
    sharedBlksHit: integer("shared_blks_hit").notNull().default(0),
    sharedBlksRead: integer("shared_blks_read").notNull().default(0),
    tempBlksWritten: integer("temp_blks_written").notNull().default(0),
  },
  (table) => ({
    // Makes snapshot ingestion idempotent: a retried batch re-sends the
    // same (fingerprint, collectedAt) pair and conflicts do nothing.
    fpCollectedIdx: uniqueIndex("query_stats_snapshots_fp_collected_idx").on(
      table.fingerprintId,
      table.collectedAt
    ),
  })
);

// --- Events + plans ------------------------------------------------------------

export const slowQueryEvents = pgTable("slow_query_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  fingerprintId: uuid("fingerprint_id").notNull().references(() => queryFingerprints.id),
  databaseId: uuid("database_id").notNull().references(() => monitoredDatabases.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  durationMs: doublePrecision("duration_ms").notNull(),
  source: slowQuerySourceEnum("source").notNull(),
  backendPid: integer("backend_pid"),
  sessionId: text("session_id"),
});

export const explainPlans = pgTable("explain_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  slowQueryEventId: uuid("slow_query_event_id").notNull().references(() => slowQueryEvents.id),
  planJson: jsonb("plan_json").notNull(),
  planningTimeMs: doublePrecision("planning_time_ms"),
  executionTimeMs: doublePrecision("execution_time_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Detections ------------------------------------------------------------------

export const nPlusOnePatterns = pgTable("n_plus_one_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  databaseId: uuid("database_id").notNull().references(() => monitoredDatabases.id),
  patternHash: text("pattern_hash").notNull(),
  fingerprintIds: jsonb("fingerprint_ids").notNull(),
  occurrencesInWindow: integer("occurrences_in_window").notNull(),
  windowSeconds: doublePrecision("window_seconds").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  status: patternStatusEnum("status").notNull().default("open"),
}, (table) => ({
  patternHashIdx: uniqueIndex("n_plus_one_patterns_pattern_hash_idx").on(table.patternHash),
}));

export const indexSuggestions = pgTable(
  "index_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    databaseId: uuid("database_id").notNull().references(() => monitoredDatabases.id),
    fingerprintId: uuid("fingerprint_id").notNull().references(() => queryFingerprints.id),
    suggestedDdl: text("suggested_ddl").notNull(),
    reasoning: text("reasoning").notNull(),
    estimatedImpact: suggestionImpactEnum("estimated_impact").notNull(),
    status: suggestionStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    dbFingerprintDdlIdx: uniqueIndex("index_suggestions_db_fp_ddl_idx").on(
      table.databaseId,
      table.fingerprintId,
      table.suggestedDdl
    ),
  })
);

// --- Enterprise-only tables --------------------------------------------------
// Present in the OSS schema so migrations don't diverge between editions,
// but only written to / read from when packages/enterprise is loaded.

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  databaseId: uuid("database_id").notNull().references(() => monitoredDatabases.id),
  ruleType: text("rule_type").notNull(),
  threshold: doublePrecision("threshold").notNull(),
  channel: text("channel").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const alertEvents = pgTable("alert_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").notNull().references(() => alerts.id),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow().notNull(),
  payload: jsonb("payload").notNull(),
});
