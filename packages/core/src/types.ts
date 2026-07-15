// Shared domain types used by collector, api, and dashboard.
// Keep this file free of runtime dependencies — types only.

export type ConnectionMode = "direct" | "log_tail" | "both";

export interface MonitoredDatabase {
  id: string;
  orgId: string;
  name: string;
  connectionMode: ConnectionMode;
  sslMode: "require" | "verify-full";
  status: "pending" | "healthy" | "degraded" | "error";
  lastPolledAt: string | null;
  createdAt: string;
}

export interface QueryFingerprint {
  id: string;
  databaseId: string;
  queryHash: string;
  normalizedQuery: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface QueryStatsSnapshot {
  id: string;
  fingerprintId: string;
  collectedAt: string;
  calls: number;
  totalExecTimeMs: number;
  meanExecTimeMs: number;
  rows: number;
  sharedBlksHit: number;
  sharedBlksRead: number;
  tempBlksWritten: number;
}

export type SlowQuerySource = "direct_poll" | "auto_explain";

export interface SlowQueryEvent {
  id: string;
  fingerprintId: string;
  databaseId: string;
  occurredAt: string;
  durationMs: number;
  source: SlowQuerySource;
  backendPid: number | null;
  sessionId: string | null;
}

export interface ExplainPlan {
  id: string;
  slowQueryEventId: string;
  planJson: unknown;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  createdAt: string;
}

export interface NPlusOnePattern {
  id: string;
  databaseId: string;
  patternHash: string;
  fingerprintIds: string[];
  occurrencesInWindow: number;
  windowSeconds: number;
  detectedAt: string;
  status: "open" | "resolved";
}

export type SuggestionImpact = "high" | "medium" | "low";

export interface IndexSuggestion {
  id: string;
  databaseId: string;
  fingerprintId: string;
  suggestedDdl: string;
  reasoning: string;
  estimatedImpact: SuggestionImpact;
  status: "pending" | "applied" | "dismissed";
  createdAt: string;
}

// Raw row shape returned by `SELECT * FROM pg_stat_statements`.
// Only the columns Query Guardian currently uses; pg_stat_statements
// exposes more (see Postgres docs) that can be added as needed.
export interface PgStatStatementsRow {
  queryid: string;
  query: string;
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
  temp_blks_written: number;
}

// Parsed shape of one auto_explain JSON log entry.
export interface AutoExplainLogEntry {
  timestamp: string;
  duration_ms: number;
  query: string;
  plan: unknown;
  pid: number | null;
  planning_time_ms: number | null;
  execution_time_ms: number | null;
}
