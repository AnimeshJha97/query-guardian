# API Reference

Base URL (self-hosted default): `http://localhost:4000/api`

All routes except `/health`, `/api/capabilities`, and `/api/auth/login`
require authentication. The self-hosted edition uses one admin password,
stored only as an Argon2id hash.

The dashboard authenticates with `POST /api/auth/login`. A successful login
sets a short-lived HttpOnly, SameSite=Strict session cookie. Browser clients
must send requests with credentials enabled.

> This document describes the intended/target API surface per the sprint
> plan. Endpoints marked **(planned)** don't exist yet in the Sprint 0
> scaffold — check the route files under `packages/api/src/routes/` for
> what's actually implemented in your checkout.

---

## Unauthenticated

### `GET /health`
Liveness check.
```json
{ "status": "ok" }
```

### `GET /api/capabilities`
Tells the dashboard which edition (OSS/enterprise) it's talking to, so it
can hide UI it doesn't have capabilities for.
```json
{
  "edition": "oss",
  "multiDatabase": false,
  "alerting": false,
  "historyRetentionDays": 7,
  "sso": false
}
```

---

## Databases

### `GET /api/databases`
Lists monitored databases (connection metadata only — DSNs are never
returned in plaintext).

### `POST /api/databases`
```json
{
  "name": "production",
  "dsn": "postgres://query_guardian_reader:***@host:5432/dbname",
  "connectionMode": "both",
  "sslMode": "verify-full"
}
```
`connectionMode` is one of `direct` | `log_tail` | `both`. Returns `201`
with the created record (DSN stored encrypted, never echoed back).

### `POST /api/databases/preflight` **(planned, Sprint 4)**
Tests a DSN against the required grants without saving it. Returns
exactly which permission is missing, if any — see `docs/architecture.md`
section 3 for what's checked.
```json
{ "dsn": "postgres://..." }
```
```json
{
  "canReadStats": true,
  "canReadStatements": false,
  "errors": ["Cannot read pg_stat_statements: ..."]
}
```

---

## Queries

### `GET /api/queries`
Query fingerprints joined with their latest stats snapshot, sorted by
total execution time descending. This is the primary "what's slow" view.
```json
[
  {
    "fingerprint": { "id": "...", "normalizedQuery": "select * from books where author_id = ?" },
    "latestSnapshot": { "calls": 250, "totalExecTimeMs": 1840.2, "meanExecTimeMs": 7.4 }
  }
]
```

### `GET /api/queries/:id`
Fingerprint detail plus up to 500 recent stats snapshots (for the
dashboard's time-series view).

### `GET /api/queries/:id/explain`
Most recent captured EXPLAIN plan for this fingerprint (from
`auto_explain`), plus the triggering slow-query event.
```json
{
  "event": { "occurredAt": "...", "durationMs": 42.1, "source": "auto_explain" },
  "plan": { "planJson": { "...": "raw EXPLAIN JSON" }, "planningTimeMs": 0.3, "executionTimeMs": 41.8 }
}
```

---

## Index suggestions

### `GET /api/suggestions`
All index suggestions (pending, applied, dismissed).

### `PATCH /api/suggestions/:id`
```json
{ "status": "applied" }
```
`status` is one of `pending` | `applied` | `dismissed`. This endpoint
only records the user's decision — it never runs DDL against the target
database. Applying an index is always a manual, deliberate action by the
user against their own database.

---

## N+1 patterns

### `GET /api/n-plus-one` **(planned, Sprint 2)**
Detected N+1 patterns with their constituent fingerprint(s), occurrence
count, and open/resolved status.

---

## Ingestion (internal — collector → API)

### `POST /api/ingest`
Not intended for external clients. The collector posts batches of
fingerprinted `pg_stat_statements` rows and parsed `auto_explain` events;
the API upserts fingerprints and persists snapshots/events/plans.
Authenticated with a dedicated service bearer token. The collector's
`QG_API_TOKEN` must equal the API's `QG_INGEST_TOKEN`; it must not reuse the
admin password or session secret.

```json
{
  "databaseName": "demo",
  "agent": { "mode": "both", "version": "0.1.0" },
  "collectedAt": "2026-07-14T10:00:00.000Z",
  "statsRows": [
    {
      "queryHash": "1f6c...", "normalizedQuery": "select * from books where author_id = ?",
      "calls": 250, "totalExecTimeMs": 1840.2, "meanExecTimeMs": 7.4, "rows": 900,
      "sharedBlksHit": 120, "sharedBlksRead": 4, "tempBlksWritten": 0
    }
  ],
  "slowQueryEvents": [
    {
      "queryHash": "1f6c...", "normalizedQuery": "select * from books where author_id = ?",
      "occurredAt": "2026-07-14T10:00:01.200Z", "durationMs": 412.8,
      "source": "auto_explain", "backendPid": 4242,
      "plan": { "planJson": { "Plan": { "...": "raw EXPLAIN JSON" } }, "executionTimeMs": 411.9 }
    }
  ]
}
```

Notes:
- `databaseId` (uuid) may be sent instead of `databaseName`. A batch with
  only a name auto-registers the monitored database on first ingest (the
  Compose demo path — no manual setup step).
- `collectedAt` is required when `statsRows` are present. Stats counters
  are **cumulative** (raw `pg_stat_statements` values); the API stores
  them as-is and computes per-interval deltas at read time.
- Ingestion is idempotent for fingerprints and snapshots: retried batches
  hit unique indexes and no-op. Individual malformed rows are dropped and
  counted, not batch-fatal.

```json
{
  "databaseId": "…", "fingerprintsUpserted": 12, "snapshotsInserted": 12,
  "eventsInserted": 3, "plansInserted": 3,
  "rejected": { "statsRows": 0, "slowQueryEvents": 0 }
}
```

---

## Error format

All error responses follow:
```json
{ "error": "human-readable message or zod validation object" }
```
`400` for validation failures, `401` for auth failures, `404` for
missing resources, `500` for unexpected server errors.

---

## Rate limits

None in the OSS self-hosted edition — you're the only client. The hosted
tier applies per-tenant rate limits on the push-ingestion endpoint; see
`packages/enterprise/README.md`.
