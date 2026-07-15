# Query Guardian

Lightweight Postgres performance monitoring: reads `pg_stat_statements` and
`auto_explain` output, detects slow queries and N+1 patterns, and suggests
indexes with EXPLAIN-based reasoning.

This repo is the **open-source, self-hosted edition** (Apache-2.0). See
`packages/enterprise/README.md` for how the hosted/paid tier plugs in
without forking this codebase.

## Quickstart

```bash
cp .env.example .env
docker compose up --build
```

This starts:
- `postgres` — demo Postgres with `pg_stat_statements` + `auto_explain` preconfigured, seeded with a demo schema (authors/books) shaped to produce a real N+1 pattern and a missing-index slow query
- `collector` — polls `pg_stat_statements` and tails `auto_explain` logs from the demo database
- `api` — Fastify API + metadata storage (Drizzle/Postgres)
- `dashboard` — React UI at http://localhost:5173

Generate some traffic so the dashboard has data to show:

```bash
node scripts/seed-workload.mjs
```

Wait one poll cycle (default 30s), then open http://localhost:5173.

## Connecting your own database instead of the demo

1. Create the least-privilege role described in `docker/postgres-demo/init.sql`
   (adapted to your database) — see the architecture doc for exactly what
   each grant is for and why.
2. Enable `pg_stat_statements` and, if you want captured EXPLAIN plans,
   `auto_explain` with `log_format = 'json'`.
3. Use the "Connect database" page in the dashboard, or `POST /api/databases`.

## Repo layout

```
packages/
  core/         MIT-licensed detection logic — fingerprinting, index
                suggestion rules, N+1 detector. No I/O, easy to unit test.
  collector/    Agent: direct SQL polling + auto_explain log tailing.
  api/          Fastify API + Postgres metadata store (Drizzle).
  dashboard/    React + Vite dashboard.
  enterprise/   Not in this repo — see its README for the interface it fills.
```

Full system design, data model, and the 3-week MVP plan this scaffold
follows: see `docs/architecture.md`.

## Status

Early scaffold — ingestion wiring between collector → API (`/api/ingest`)
and the EXPLAIN-plan → index-suggestion pipeline are stubbed with `TODO`s.
See inline comments in `packages/collector/src/index.ts` for what's next.
