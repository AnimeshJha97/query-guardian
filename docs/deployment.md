# Production Deployment

The root `docker-compose.yml` is a demo/dev stack (seeded demo database,
dashboard dev server, no TLS). This guide covers running Query Guardian
for real.

> Status: this guide describes the target state from Sprint 8 of
> `docs/sprint-plan.md`. If `docker-compose.prod.yml` doesn't exist yet in
> your checkout, that sprint hasn't been built yet — use this doc as the
> spec, not as a guarantee it's already there.

## 1. Separate metadata storage from any demo data

Production should point `QG_METADATA_DATABASE_URL` at its own managed
Postgres instance (RDS, Cloud SQL, or a Postgres you operate yourself) —
not the same instance as any database you're monitoring, and never the
bundled demo Postgres image.

## 2. Use `docker-compose.prod.yml`

```bash
docker compose -f docker-compose.prod.yml up -d
```

Differences from the dev stack:
- No demo Postgres or seed data
- Dashboard is a static production build served behind a lightweight
  static server, not the Vite dev server
- Resource limits and `restart: always` on every service
- No ports exposed directly — everything routes through the reverse
  proxy in step 3

## 3. Put a reverse proxy in front (TLS)

Example using Caddy (automatic Let's Encrypt certs):
```caddyfile
guardian.yourdomain.com {
  reverse_proxy dashboard:5173
}

guardian-api.yourdomain.com {
  reverse_proxy api:4000
}
```
Traefik with Docker labels works equally well if that's already part of
your stack.

## 4. Secrets

Generate these once and store them in your secrets manager (not in a
committed `.env`):
- `QG_ADMIN_PASSWORD_HASH` — Argon2id hash for the self-hosted admin login
- `QG_SESSION_SECRET` — random session-signing secret (32+ characters)
- `QG_INGEST_TOKEN` — independent collector service credential
- `QG_ENCRYPTION_KEY` — encrypts stored DSNs at rest; **losing this key
  means re-entering every monitored database's connection string**
- `QG_TARGET_DATABASE_URL` — per monitored database, using the
  least-privilege role from `docs/installation.md`

`install.sh` (Sprint 8) generates the first two for you if you don't
already have a secrets workflow.

## 5. Backups

Back up the **metadata database**, not the databases you're monitoring
(those are the user's responsibility). A simple daily job:
```bash
pg_dump "$QG_METADATA_DATABASE_URL" | gzip > "backup-$(date +%F).sql.gz"
```
See `scripts/backup-metadata-db.sh` once Sprint 7 lands for a maintained
version of this.

## 6. Retention

The self-hosted default is 7 days of raw `query_stats_snapshots` before
they're rolled up into daily aggregates (Sprint 7). If you need longer
raw retention, it's a config change, not a code change — check
`packages/api/src/jobs/rollupSnapshots.ts` once it exists.

## 7. Monitoring the monitor

Query Guardian exposes:
- `GET /health` — liveness
- `GET /ready` — readiness (checks metadata DB connectivity)

Point your existing uptime/monitoring tooling at these rather than
building something bespoke.

## 8. Scaling notes

For the self-hosted OSS edition, one collector per monitored database is
the expected topology — don't try to have a single collector poll
multiple targets; it complicates the connection-security story for no
real benefit at this scale. If you need to monitor many databases,
that's what the hosted/enterprise tier's multi-database support is for
(see `docs/roadmap.md`).
