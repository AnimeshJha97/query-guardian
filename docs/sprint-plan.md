# Query Guardian — Sprint Plan (Claude Code Execution Track)

This replaces the original "3-week human sprint" framing. Since you're
building AI-first with Claude Code, sprints here are **scoped to fit one
focused Claude Code session** (roughly one context window / one problem
domain), not a calendar week. Work through them in order — each one
assumes the previous is merged and working. Sprint 0 is already done (the
scaffold you have).

Each sprint has: goal, tasks, files touched, Definition of Done, and a
ready-to-paste **kickoff prompt** for Claude Code. Paste the kickoff
prompt as-is, then let Claude Code read the repo and the linked docs
(`docs/architecture.md`, this file, `docs/api.md`) for context — don't
re-explain the system in the prompt itself, that's what the docs are for.

---

## Sprint 0 — Foundations ✅ done

Monorepo scaffold, Drizzle schema (12 tables), Fastify API skeleton,
collector with polling + log-tail stubs, React dashboard shell, Docker
Compose demo stack with seeded N+1 workload. All packages typecheck and
`npm install` is clean.

---

## Sprint 1 — Collector → API ingestion pipeline ✅ done

**Goal:** data actually flows from Postgres → collector → API → metadata DB.
Right now the collector only logs to stdout.

**Tasks**
- [x] `POST /api/ingest` endpoint accepting a batch: `{ databaseId | databaseName, statsRows[], slowQueryEvents[] }` (name-based batches auto-register the monitored database so the Compose demo needs no manual setup)
- [x] Upsert `query_fingerprints` (insert on new `queryHash`, update `lastSeenAt` otherwise) — unique index on `(database_id, query_hash)`, migration `0001`
- [x] Insert `query_stats_snapshots` — raw cumulative snapshots stored as-is; deltas computed at read time (`computeSnapshotDeltas` in `packages/core/src/deltas.ts`, exposed via `GET /api/queries/:id`); unique `(fingerprint_id, collected_at)` index makes retried batches no-ops
- [x] Insert `slow_query_events` + `explain_plans` from auto_explain entries
- [x] Collector: `packages/collector/src/apiClient.ts` `IngestClient` — stats flush every poll cycle, events flush on size/delay, retry with exponential backoff, 4xx = drop + loud log, failed stats dropped (cumulative counters re-sent next poll), failed events re-queued with a cap
- [x] Collector heartbeat: `collector_agents.last_heartbeat_at` upserted per ingest; `monitored_databases.last_polled_at`/`status` refreshed too
- [x] Unit tests: delta computation + fingerprint stability (`core/test`), batch validation + malformed-row handling (`api/test`), retry/backoff/batching (`collector/test`)

**Files touched:** `packages/api/src/routes/ingest.ts` (new), `packages/collector/src/index.ts`, `packages/collector/src/apiClient.ts` (new), tests in both.

**Definition of Done:** `docker compose up`, then `node scripts/seed-workload.mjs`, then within one poll interval `GET /api/queries` returns real rows with non-null `latestSnapshot` — no manual DB inserts required.

**Kickoff prompt:**
> Read `docs/architecture.md` and `docs/sprint-plan.md` Sprint 1. Implement the ingestion pipeline described there: a new `/api/ingest` endpoint, collector-side batching client with retry/backoff, and fingerprint upsert logic. Add unit tests for delta computation and upsert idempotency. Verify end-to-end using `docker compose up` and `scripts/seed-workload.mjs` — data should appear via `GET /api/queries` without manual intervention.

---

## Sprint 2 — Detection pipeline wiring ✅ done

**Goal:** the rule-based engines in `packages/core` (already written) actually run against ingested data and persist results.

**Tasks**
- [x] On ingest of a new `explain_plan`, run `suggestIndexesFromPlan` and upsert into `index_suggestions` — dedupe by `(databaseId, fingerprintId, suggestedDdl)` so repeated captures don't spam duplicates
- [x] Scheduled job (in `api` or a small worker in `collector`) that runs `detectNPlusOne` over recent `slow_query_events` every N seconds and upserts `n_plus_one_patterns`, deduped by `patternHash` with a "still open" vs "resolved" transition (resolved if the pattern hasn't recurred in the last window)
- [x] `GET /api/n-plus-one` endpoint
- [x] `GET /api/queries` response includes suggestion count per fingerprint
- [x] Fixture-based tests: real EXPLAIN JSON samples (seq scan, sort, index scan) run through `suggestIndexesFromPlan` with expected output snapshots

**Files touched:** `packages/api/src/routes/nPlusOne.ts` (new), `packages/api/src/jobs/detectPatterns.ts` (new), `packages/api/src/routes/ingest.ts` (extend), fixtures in `packages/core/test/fixtures/`.

**Definition of Done:** running the seed workload produces at least one visible index suggestion (missing index on `books.published_year`) and one N+1 pattern (books-per-author loop) in the dashboard's API responses.

**Kickoff prompt:**
> Read `docs/architecture.md` and `docs/sprint-plan.md` Sprint 2. Wire the existing `packages/core` detection engines (`suggestIndexesFromPlan`, `detectNPlusOne`) into the ingestion and a scheduled job so they persist to `index_suggestions` and `n_plus_one_patterns` with proper deduplication. Add fixture-based tests using realistic EXPLAIN JSON. Verify against the seeded demo workload.

---

## Sprint 3 — Dashboard core UX ✅ done

**Goal:** the dashboard is actually useful to look at, not just a table.

**Tasks**
- [x] Query detail page: EXPLAIN plan viewer (collapsible tree, cost/row estimates vs actual), stats-over-time sparkline (Recharts) using `query_stats_snapshots`
- [x] N+1 patterns page: grouped view, link back to the offending fingerprint(s)
- [x] Index suggestions page: reasoning text, copyable DDL, Apply/Dismiss buttons wired to `PATCH /api/suggestions/:id`
- [x] Overview/home page: top 5 slowest queries, count of open N+1 patterns, count of pending suggestions — the "what needs my attention" landing view
- [x] Loading/empty/error states everywhere (no blank screens)
- [x] Basic design pass: consistent spacing/type scale, not just unstyled Tailwind defaults

**Files touched:** `packages/dashboard/src/pages/*` (new: `QueryDetail.tsx`, `NPlusOnePatterns.tsx`, `Suggestions.tsx`, `Overview.tsx`), routing in `App.tsx`.

**Definition of Done:** a new user can open the dashboard after `docker compose up` + seed script and understand, without reading code, what's slow and what to do about it.

**Kickoff prompt:**
> Read `docs/architecture.md` and `docs/sprint-plan.md` Sprint 3. Build out the dashboard pages listed there against the existing API. Prioritize the overview page and query detail EXPLAIN viewer — those are the core "aha" moments for a first-time user. Use Recharts for the stats sparkline and keep the visual design consistent (spacing/type scale), not just default Tailwind.

---

## Sprint 4 — Onboarding & connection UX ✅ done

**Goal:** connecting a real (non-demo) database is safe and doesn't require reading source code.

**Tasks**
- [x] `POST /api/databases/preflight` — takes a DSN, attempts connection + `checkPermissions()`, returns exactly what's missing (mirrors `packages/collector/src/targetDb.ts` logic, reused as a shared module)
- [x] Setup wizard UI: paste DSN → live preflight check with actionable errors → generates the exact `GRANT`/`CREATE ROLE` SQL for the user to run → confirm → save
- [x] DSN encryption at rest: replace the `ENCRYPT_ME:` stub in `routes/databases.ts` with real AES-256-GCM encryption using a key from `QG_ENCRYPTION_KEY` (generated at install time, documented in the install script)
- [x] Connection health indicator in the dashboard nav (reads `collector_agents.last_heartbeat_at`, flags stale > 2x poll interval)

**Files touched:** `packages/api/src/routes/databases.ts`, `packages/api/src/crypto.ts` (new), `packages/collector/src/targetDb.ts` (extract shared preflight logic into `packages/core` if it doesn't need a live connection, or keep in a small shared internal package), `packages/dashboard/src/pages/ConnectDatabase.tsx` (rewrite as multi-step wizard).

**Definition of Done:** a user with a real production Postgres (not the demo) can go from "nothing" to "seeing their real slow queries" using only the UI, with clear error messages if a grant is missing.

**Kickoff prompt:**
> Read `docs/architecture.md` and `docs/sprint-plan.md` Sprint 4. Build the preflight-check endpoint and turn `ConnectDatabase.tsx` into a proper setup wizard. Implement real DSN encryption at rest (AES-256-GCM, key from `QG_ENCRYPTION_KEY` env var) replacing the current placeholder. Add a heartbeat-based connection health indicator to the dashboard nav.

---

## Sprint 5 — Auth & security hardening

**Goal:** ready for a stranger on the internet to self-host without obvious holes.

**Tasks**
- [x] Replace single shared-password bearer auth with hashed password (argon2/bcrypt) + short-lived session token (signed cookie or JWT), login/logout endpoints, rate limiting on login
- [x] CSRF protection appropriate to the chosen session mechanism (SameSite cookies at minimum)
- [x] Dependency audit: `npm audit`, pin versions, add Dependabot config
- [x] Dockerfile hardening: non-root user in all three service images, multi-stage builds already in place — verify no build tools/secrets leak into final images
- [x] Input validation audit: confirm every route validates with `zod` (some routes currently trust `req.params`/`req.body` shape from TS types alone, which doesn't hold at runtime)
- [x] `SECURITY.md` responsible-disclosure policy (already drafted — verify it matches what's actually implemented)

**Files touched:** `packages/api/src/auth.ts` (rewrite), new `routes/auth.ts`, `Dockerfile`s (all three), `.github/dependabot.yml`.

**Definition of Done:** `npm audit` clean of high/critical, no route accepts unvalidated input, no container runs as root, login has brute-force protection.

**Kickoff prompt:**
> Read `docs/architecture.md`, `docs/sprint-plan.md` Sprint 5, and `SECURITY.md`. Replace the placeholder single-password auth with a proper hashed-password + session-token flow including rate limiting on login. Audit every API route for zod validation coverage. Harden all three Dockerfiles to run as non-root. Run and fix `npm audit`.

---

## Sprint 6 — Testing & CI/CD

**Goal:** nothing ships without an automated check; regressions get caught before merge.

**Tasks**
- [ ] Vitest unit tests across `core`, `api`, `collector` (target meaningful coverage of the detection logic and route handlers, not a coverage-percentage vanity metric)
- [ ] Playwright e2e: spin up the full Compose stack in CI, run the seed script, assert the dashboard shows expected queries/suggestions/patterns
- [ ] GitHub Actions: `lint` + `typecheck` + `test` on every PR; on `main` merge, build and push images to GHCR tagged with commit SHA + `latest`
- [ ] Branch protection notes in `CONTRIBUTING.md` (requires the above checks to pass)

**Files touched:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `packages/*/test/`, `playwright.config.ts` (new, root or dashboard).

**Definition of Done:** a PR with a deliberately broken test fails CI; a clean PR merges and produces new GHCR images automatically.

**Kickoff prompt:**
> Read `docs/architecture.md` and `docs/sprint-plan.md` Sprint 6. Set up Vitest across all packages and a Playwright e2e suite that runs against the Docker Compose stack with the seed workload. Add GitHub Actions workflows for CI (lint/typecheck/test on PR) and release (build + push images to GHCR on merge to main).

---

## Sprint 7 — Observability & ops

**Goal:** operable in production without SSH-ing in and guessing.

**Tasks**
- [x] Structured JSON logging via Fastify's built-in Pino, log level from `QG_LOG_LEVEL`
- [x] `/health` (liveness) and `/ready` (readiness — checks metadata DB connectivity) on the API; equivalent lightweight check in the collector
- [x] Resource limits + restart policies in `docker-compose.prod.yml`
- [x] Backup guidance + a `scripts/backup-metadata-db.sh` (`pg_dump` wrapper) for the metadata store
- [x] Retention/rollup job for `query_stats_snapshots` (raw snapshots older than N days get rolled into daily aggregates) so the metadata DB doesn't grow unbounded — self-hosted default 7 days per the architecture doc

**Files touched:** `packages/api/src/server.ts`, `docker-compose.prod.yml` (new), `scripts/backup-metadata-db.sh` (new), `packages/api/src/jobs/rollupSnapshots.ts` (new).

**Definition of Done:** `docker-compose.prod.yml` runs with restart policies and resource limits; a manual `docker compose down && up` doesn't lose data; snapshots older than the retention window are rolled up, not deleted outright.

**Kickoff prompt:**
> Read `docs/architecture.md` and `docs/sprint-plan.md` Sprint 7. Add structured logging, liveness/readiness endpoints, a production Compose file with resource limits and restart policies, a metadata DB backup script, and a scheduled rollup job for old `query_stats_snapshots` per the 7-day self-hosted retention default.

---

## Sprint 8 — Production packaging & release

**Goal:** a stranger can go from "found this on GitHub" to "running in production" in under 15 minutes.

**Tasks**
- [ ] Dashboard: swap the dev-server Dockerfile for a production build (`vite build`) served via a minimal static server (nginx or `serve`) — the current Dockerfile runs `vite dev`, which is not production-appropriate
- [ ] `docker-compose.prod.yml`: no demo Postgres/seed data, external metadata DB volume documented, environment-driven config only, no ports exposed except through a reverse proxy
- [ ] Reverse proxy example (Caddy or Traefik) with automatic TLS, documented in `docs/deployment.md`
- [ ] One-command install script (`install.sh`): generates `.env` with a random `QG_ADMIN_PASSWORD`/`QG_ENCRYPTION_KEY`, prints next steps
- [ ] Semantic versioning + `CHANGELOG.md` convention, first tagged `v0.1.0` release with GitHub Release notes generated from merged PRs

**Files touched:** `packages/dashboard/Dockerfile` (rewrite), `docker-compose.prod.yml`, `docs/deployment.md`, `install.sh` (new), `CHANGELOG.md`.

**Definition of Done:** on a clean VM with only Docker installed, `curl .../install.sh | sh && docker compose -f docker-compose.prod.yml up -d` results in a working, TLS-terminated dashboard.

**Kickoff prompt:**
> Read `docs/architecture.md`, `docs/sprint-plan.md` Sprint 8, and `docs/deployment.md`. Rewrite the dashboard Dockerfile to build a production static bundle instead of running the dev server. Create `docker-compose.prod.yml` and an `install.sh` bootstrap script. Add a reverse-proxy example (Caddy preferred for automatic TLS) to the deployment docs.

---

## Sprint 9 — Hosted tier foundations (`packages/enterprise`, separate/private repo)

**Goal:** open-core boundary gets its first real implementation. This is a distinct track from the OSS v1 launch — don't block Sprint 8's release on this.

**Tasks**
- [ ] Multi-tenant org/user model (extends `organizations`/`users`, already schema-compatible)
- [ ] Push-based ingestion: per-tenant auth tokens, an ingest endpoint the local collector agent dials out to (no inbound connection to user infra — see architecture doc section 3)
- [ ] Alerting engine: threshold rules against `query_stats_snapshots`/`n_plus_one_patterns`, delivery via webhook/email/Slack, backed by the existing `alerts`/`alert_events` tables
- [ ] Extended retention: configurable rollup windows beyond the OSS 7-day default
- [ ] SSO (OIDC) as an additional `AuthProvider` implementation
- [ ] Billing: Stripe metering, one unit = one monitored database (simplest model to start; revisit before general availability)

**Definition of Done:** `packages/enterprise` implements every interface listed in its own `README.md`; dropping it into `packages/api` (dynamic import already wired in `capabilities.ts`) flips the dashboard into enterprise mode with no OSS code changes required.

**Kickoff prompt:**
> Read `docs/architecture.md` section 1 (open-core boundary) and `packages/enterprise/README.md`. This work happens in a separate private repository/package, not the OSS repo. Implement the interfaces documented there: multi-tenant auth, push-based ingestion with per-tenant tokens, an alerting engine backed by the existing `alerts` schema, and Stripe-based metering. Confirm the OSS `api` package requires zero changes to pick this up via its existing dynamic import in `capabilities.ts`.

---

## Sprint 10 — Launch prep

**Goal:** ready for public GitHub traffic.

**Tasks**
- [ ] Repo polish: description, topics/tags, social preview image, pinned demo GIF or short video in the README
- [ ] `.github/ISSUE_TEMPLATE/` (bug report, feature request), `PULL_REQUEST_TEMPLATE.md`
- [ ] `CODE_OF_CONDUCT.md`
- [ ] Verify every doc in `docs/` is accurate against the actual shipped code (docs drift is the #1 first-impression killer for OSS infra tools)
- [ ] Launch post draft for relevant communities (r/PostgreSQL, Hacker News "Show HN", Postgres Weekly submission) — factual, no overclaiming what the tool does
- [ ] **Flag for human review, not Claude Code:** if the hosted tier launches alongside OSS, Terms of Service and Privacy Policy need actual legal review — don't ship AI-drafted legal text as final without a lawyer reading it.

**Definition of Done:** you'd be comfortable posting the repo link publicly today.

**Kickoff prompt:**
> Read `docs/architecture.md` and `docs/sprint-plan.md` Sprint 10. Add issue/PR templates, a code of conduct, and do a full pass verifying every file in `docs/` matches the current implementation — flag and fix any drift. Do not draft final legal documents (ToS/Privacy Policy) as production-ready; note where a human needs to review them instead.

---

## How to sequence this with a 5-hour Claude Code reset window

- Sprints 1–3 are the critical path to a genuinely useful OSS tool — do these first, in order.
- Sprints 4–5 can interleave; 4 is UX-facing, 5 is security-facing, and they touch different files.
- Sprint 6 (CI) is worth pulling forward if you notice Claude Code regressing earlier work — cheaper to catch early than after Sprint 8.
- Sprint 9 is a parallel track for whenever you're ready to build the paid tier; it doesn't block anything else.
- Sprint 10 is the last thing you do, right before making the repo public.

Each kickoff prompt above is intentionally short — it points Claude Code at the docs rather than re-deriving context, which is both cheaper on tokens and keeps a single source of truth (this file + `docs/architecture.md`) instead of instructions drifting across prompts.
