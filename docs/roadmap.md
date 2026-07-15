# Roadmap

Query Guardian ships as two editions from one codebase (see
`docs/architecture.md` section 1 for the open-core boundary):

- **Self-hosted (OSS, Apache-2.0)** — this repository. Single database,
  single admin user, 7-day retention, no alerting.
- **Hosted / Enterprise** — `packages/enterprise` (private). Multi-database,
  multi-user with SSO, alerting, extended retention, managed hosting.

## Near-term (post Sprint 0, tracked in `docs/sprint-plan.md`)

- Collector → API ingestion pipeline (Sprint 1)
- Rule-based index suggestions + N+1 detection wired end-to-end (Sprint 2)
- Full dashboard UX: query detail, EXPLAIN viewer, N+1 view, suggestions (Sprint 3)
- Guided onboarding with live permission checking (Sprint 4)
- Production-grade auth, CI/CD, deployment packaging (Sprints 5–8)

## Planned features (not yet scheduled to a sprint)

**Detection quality**
- Real SQL parsing (replace the current regex-based normalizer in
  `packages/core/src/fingerprint.ts`) to eliminate false fingerprint
  splits/collisions on edge cases like string literals containing quotes
- Multi-fingerprint N+1 correlation — currently detects bursts of the
  *same* query; a real ORM N+1 often looks like "one parent query, then N
  near-identical child queries" which is a different, harder pattern to
  detect reliably
- Historical regression detection: "this query got 3x slower after
  Tuesday's deploy" by comparing rolling windows, not just absolute
  thresholds
- Bloat/vacuum awareness: surface when a slow query correlates with table/
  index bloat rather than a missing index (a different fix entirely)
- Lock contention detection using `pg_stat_activity` wait events, not just
  `pg_stat_statements` timing

**Index suggestions**
- Composite index suggestions (multi-column), not just single-column
- Detecting redundant/unused existing indexes as *removal* candidates
- Estimated impact backed by actual cost-model math (comparing planner
  cost with/without a hypothetical index via `hypopg`), not just the
  current heuristic loop-count bucketing

**Alerting (enterprise)**
- Threshold-based (mean exec time, N+1 occurrence count) to start
- Anomaly-based (statistical deviation from baseline) as a stretch goal —
  meaningfully harder to tune well; don't commit to a launch date for
  this until threshold-based alerting has real usage data

**Multi-database / fleet view (enterprise)**
- Single dashboard across many monitored databases
- Cross-database pattern detection (the same N+1-prone ORM pattern
  showing up in three services)

**Integrations**
- Slack/PagerDuty/webhook alert delivery
- CI integration: fail a PR if a migration would introduce an
  unindexed foreign key (a static-analysis feature, not a live-monitoring
  one — likely a separate lightweight tool that shares the `core` package)
- Read-replica-aware EXPLAIN — prefer running plan-only EXPLAIN against a
  replica when one is configured, to avoid any planner-privilege
  discussion on the primary

**Platform**
- SSO/OIDC for the hosted tier
- Audit log of who dismissed/applied which suggestion
- Docs site (Docusaurus/VitePress) if the `docs/` folder outgrows what's
  comfortable to browse on GitHub directly

## Explicitly not planned

- **Automatic DDL execution.** Query Guardian will keep suggesting, never
  applying, index changes. Running `CREATE INDEX` against a user's
  production database automatically is a correctness and trust problem
  that isn't worth the convenience — see `docs/architecture.md` for the
  same reasoning applied to why EXPLAIN never runs with `ANALYZE` live.
- **Query rewriting/optimization suggestions beyond indexing.** Out of
  scope for the core product; rewriting application-level ORM code is a
  different problem than database observability.

## How this roadmap gets maintained

Update this file whenever a planned feature moves into an active sprint
in `docs/sprint-plan.md`, and whenever a new idea is deliberately
deferred — the "explicitly not planned" section is as useful to
contributors as the planned one.
