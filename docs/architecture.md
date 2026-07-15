# Query Guardian — System Design & MVP Plan

## 1. Open-core architecture (split from day one)

Monorepo, pnpm workspaces (or Turborepo). Boundary is enforced by **pluggable interfaces**, not by deleting code later.

```
query-guardian/
├── packages/
│   ├── core/          # MIT/Apache-2.0 — fingerprinting, EXPLAIN parsing,
│   │                  # N+1 detector, index-suggestion rules, shared types
│   ├── collector/      # OSS — agent: direct SQL polling + log tailing
│   ├── api/            # OSS — Fastify API; storage & auth are interfaces
│   ├── dashboard/       # OSS — React app, feature-flagged UI
│   └── enterprise/     # PRIVATE repo, license-gated — imported only by
│                        # api/dashboard when a license key is present
├── docker-compose.yml   # OSS self-hosted stack
└── docker-compose.enterprise.yml  # not published
```

**Key interfaces in `core`/`api` that `enterprise` implements:**
- `AuthProvider` — self-hosted: single admin user via env var. Enterprise: SSO/org/RBAC.
- `TenantResolver` — self-hosted: hardcoded single tenant. Enterprise: multi-org.
- `AlertSink` — self-hosted: none/webhook stub. Enterprise: email/Slack/PagerDuty + rules engine.
- `RetentionPolicy` — self-hosted: fixed 7-day rollups. Enterprise: configurable, long-term.
- `StorageDriver` — both use Postgres, but enterprise adds sharding/rollup tables.

Dashboard reads a `/api/capabilities` response to hide multi-DB switcher, alerting, and extended history unless enterprise is active — so OSS and paid share one UI codebase.

License: `core`, `collector`, `api`, `dashboard` under Apache-2.0. `enterprise` under BUSL or proprietary, distributed only to paying customers / hosted deployment.

---

## 2. Data model

Two logical stores:
- **Target DB** — the user's Postgres being monitored (untouched, except a read-only role).
- **Metadata DB** — Query Guardian's own storage (in the Compose demo this is a second Postgres schema on the same instance for simplicity; production self-hosted should point at a separate instance).

```sql
-- Tenancy (single row for self-hosted)
organizations(id, name, created_at)
users(id, org_id, email, password_hash, role)

-- Connections
monitored_databases(
  id, org_id, name,
  connection_mode enum('direct','log_tail','both'),
  dsn_encrypted, ssl_mode,
  status enum('pending','healthy','degraded','error'),
  last_polled_at, created_at
)
collector_agents(id, database_id, mode, version, last_heartbeat_at)

-- Query identity + time series
query_fingerprints(
  id, database_id, query_hash, normalized_query,
  first_seen_at, last_seen_at
)
query_stats_snapshots(          -- from pg_stat_statements, polled
  id, fingerprint_id, collected_at,
  calls, total_exec_time, mean_exec_time, rows,
  shared_blks_hit, shared_blks_read, temp_blks_written
)

-- Events + plans
slow_query_events(
  id, fingerprint_id, database_id, occurred_at,
  duration_ms, source enum('direct_poll','auto_explain'),
  backend_pid, session_id
)
explain_plans(
  id, slow_query_event_id, plan_json,
  planning_time_ms, execution_time_ms, created_at
)

-- Detections
n_plus_one_patterns(
  id, database_id, pattern_hash,
  fingerprint_ids jsonb, occurrences_in_window,
  window_seconds, detected_at, status enum('open','resolved')
)
index_suggestions(
  id, database_id, fingerprint_id,
  suggested_ddl, reasoning text,
  estimated_impact enum('high','medium','low'),
  status enum('pending','applied','dismissed'), created_at
)

-- Enterprise only
alerts(id, org_id, database_id, rule_type, threshold, channel, enabled)
alert_events(id, alert_id, triggered_at, payload jsonb)
```

`normalized_query` + `query_hash` mirror pg_stat_statements' own normalization so fingerprints line up across both direct-poll and log-tail sources.

---

## 3. Collector: connecting to the user's DB safely

Both direct SQL and log tailing, as you asked — they cover different gaps: direct SQL gives cheap aggregate stats, log tailing gives per-execution EXPLAIN plans and catches N+1 bursts that aggregates smear together.

**Least-privilege role, created by a setup script the user reviews before running:**
```sql
CREATE ROLE query_guardian_reader LOGIN PASSWORD '...';
GRANT pg_read_all_stats TO query_guardian_reader;   -- built-in, read-only, no table access needed for pg_stat_statements
GRANT CONNECT ON DATABASE target_db TO query_guardian_reader;
GRANT USAGE ON SCHEMA public TO query_guardian_reader;
-- Only if you want live EXPLAIN (no ANALYZE) support:
GRANT SELECT ON ALL TABLES IN SCHEMA public TO query_guardian_reader;
```
- `pg_read_all_stats` is enough for `pg_stat_statements`/`pg_stat_activity` — no data access.
- `EXPLAIN` (without `ANALYZE`) never executes the query, but Postgres still requires `SELECT` privilege on referenced relations to generate a plan (this is intentional, to stop plan-based information leakage). That SELECT grant is the only place the collector role touches actual data access — and it's exercised, not table content is never read. Document this tradeoff explicitly in the setup wizard so users can opt out (mode: log-tail-only) if they don't want to grant it.
- We never run `EXPLAIN ANALYZE` live — that executes the query for real. All ANALYZE-level plans come from `auto_explain` log output that the user's own production traffic already generated.
- TLS required (`sslmode=verify-full` recommended, `require` minimum). DSN stored encrypted at rest (libsodium sealed box or KMS in hosted tier), never logged, redacted in error messages.
- **Self-hosted:** collector container runs inside the user's own infra with the DSN in `.env` — nothing leaves their network unless they choose to.
- **Hosted tier:** push-based agent model, not inbound. The user runs a small local agent that dials out to Query Guardian's ingest endpoint — avoids asking users to open inbound firewall rules to a hosted collector's IP, and keeps the security story identical to self-hosted ("we never connect to you; you connect to us").
- Direct polling: every 30–60s, snapshot `pg_stat_statements`, diff against prior snapshot, store deltas as `query_stats_snapshots`.
- Log tailing: requires `auto_explain.log_format = json` (recommended) or CSV logging enabled; a sidecar tails the log file/stream, parses structured entries, matches to fingerprints via normalized-query hash.
- Health/permission check built into onboarding: the collector attempts each grant it needs and reports exactly what's missing in the UI, rather than failing silently later.

---

## 4. MVP feature list — 3 weeks, priority = Compose + dashboard UX

Given your priority, detection logic stays deliberately simple (rule-based v1) so the polish budget goes into onboarding and the UI.

**Week 1 — Foundations**
- Monorepo scaffold, shared `core` types package, Postgres migrations (Drizzle or node-pg-migrate).
- `docker-compose.yml`: custom Postgres image with `pg_stat_statements` + `auto_explain` preloaded, collector, api, dashboard, metadata DB.
- Collector: direct SQL polling → fingerprinting → snapshot storage. This alone should produce visible data on `docker compose up`.
- Seed script: a small Node script that runs a synthetic workload against the demo DB, including a deliberate N+1 pattern, so first-run UI isn't empty.

**Week 2 — Detection + API + dashboard shell**
- Log tailing for `auto_explain` JSON output → `slow_query_events` + `explain_plans`.
- Index suggestion rules v1: sequential scan + high call count, missing FK index, sort without supporting index, unused index detection (skip in MVP if time-constrained).
- N+1 detector v1: same fingerprint, same backend_pid/session, N occurrences inside a short window (e.g. >5 calls in 200ms).
- REST API: `/databases`, `/queries`, `/queries/:id`, `/queries/:id/explain`, `/suggestions`, `/capabilities`.
- Dashboard shell: connect-DB wizard with live permission checker, overview page, sortable query list (TanStack Table).

**Week 3 — Onboarding polish + docs**
- Query detail page: EXPLAIN plan tree/table view, N+1 grouping view.
- Index suggestions page: reasoning text + copy-to-clipboard DDL.
- One-command `docker compose up` → data visible within ~60s, no manual SQL required from the user beyond approving the role-creation script.
- Basic auth (single admin, env-set password) for the self-hosted dashboard.
- README, `ARCHITECTURE.md`, `LICENSE` (Apache-2.0 for OSS packages), `CONTRIBUTING.md`.
- Stretch if time remains: CSV export, dark mode, "unused index" rule.

**Explicitly out of scope for the 3-week MVP:** multi-DB switching, alerting, SSO, long-term retention/rollups, hosted push-agent — these are exactly the `enterprise` package boundary, so cutting them doesn't create rework later.

---

## 5. Stack specifics

- **Collector/API:** Node 20+, TypeScript, Fastify, `pg` (node-postgres), Drizzle ORM, Zod validation, `chokidar`/tail-stream for log reading, in-process `node-cron` scheduler (defer Redis/BullMQ to the hosted tier — one less moving part in the OSS Compose stack).
- **Dashboard:** React + Vite, TanStack Query + TanStack Table, Recharts for time series, Tailwind.
- **DB:** Postgres 15+ for both target and metadata stores; `pg_stat_statements` and `auto_explain` must be in `shared_preload_libraries` — bake this into the demo image's `postgresql.conf`.
