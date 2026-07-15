// Shapes mirror packages/api responses (Drizzle rows serialized to JSON,
// so timestamps arrive as ISO strings).

export interface Fingerprint {
  id: string;
  databaseId: string;
  queryHash: string;
  normalizedQuery: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface StatsSnapshot {
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

export interface QueryListRow {
  fingerprint: Fingerprint;
  latestSnapshot: StatsSnapshot | null;
  suggestionCount: number;
  pendingSuggestionCount: number;
}

export interface QueryDetailResponse {
  fingerprint: Fingerprint;
  snapshots: StatsSnapshot[];
}

export interface SlowQueryEvent {
  id: string;
  fingerprintId: string;
  databaseId: string;
  occurredAt: string;
  durationMs: number;
  source: "direct_poll" | "auto_explain";
}

export interface ExplainResponse {
  event: SlowQueryEvent;
  plan: {
    id: string;
    planJson: unknown;
    planningTimeMs: number | null;
    executionTimeMs: number | null;
    createdAt: string;
  } | null;
}

export type SuggestionImpact = "high" | "medium" | "low";
export type SuggestionStatus = "pending" | "applied" | "dismissed";

export interface Suggestion {
  id: string;
  databaseId: string;
  fingerprintId: string;
  suggestedDdl: string;
  reasoning: string;
  estimatedImpact: SuggestionImpact;
  status: SuggestionStatus;
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

export interface MonitoredDatabase {
  id: string;
  name: string;
  connectionMode: "direct" | "log_tail" | "both";
  sslMode: string;
  status: "pending" | "healthy" | "degraded" | "error";
  lastPolledAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export type ConnectionMode = "direct" | "log_tail" | "both";
export type SslMode = "require" | "verify-full";

export interface PreflightMissingCheck {
  key: "connect" | "stats" | "statements";
  label: string;
  sql: string;
}

/** Response shape of POST /api/databases/preflight. */
export interface PreflightResponse {
  canConnect: boolean;
  canReadStats: boolean;
  canReadStatements: boolean;
  sslMode: SslMode;
  setupSql: string;
  missing: PreflightMissingCheck[];
  errors: string[];
}
