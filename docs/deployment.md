# Production Deployment

The root `docker-compose.yml` is a demo/development stack. The production
stack includes a static dashboard image, the API and collector, and Caddy for
automatic TLS. It intentionally does not include Postgres or seed data.

## 1. Bootstrap the configuration

From a fresh clone, with Docker and the Compose plugin installed:

```bash
sh install.sh
```

The script asks for the public hostname and the metadata and target database
URLs. It creates a permission-restricted `.env`, generates independent random
session, ingest, and encryption secrets, and prints a generated admin password
once. Store that password in your password manager.

## 2. Use separate, persistent metadata storage

Point `QG_METADATA_DATABASE_URL` at its own managed Postgres instance (RDS,
Cloud SQL, or a Postgres you operate yourself), not a database being monitored
and never the bundled demo Postgres image.

If you operate metadata Postgres yourself, keep its data on a named or external
persistent volume and back that volume up. The production Compose file does not
manage that database or its volume; `QG_METADATA_DATABASE_URL` is the boundary
between Query Guardian and your managed database.

## 3. Start the production stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Unlike the development stack, it has:

- No demo Postgres or seed data
- A Vite production bundle served by unprivileged nginx
- Resource limits and `restart: unless-stopped` on every service
- Only Caddy publishing ports (TCP 80/443 and UDP 443); application containers
  remain on the private Compose network

## 4. Caddy reverse proxy and automatic TLS

Set `QG_DOMAIN` to a hostname whose DNS A/AAAA record points at the host. The
included `Caddyfile` is deliberately small:

```caddyfile
{$QG_DOMAIN} {
  encode zstd gzip
  reverse_proxy dashboard:8080
}
```

Caddy obtains and renews the certificate automatically. The dashboard nginx
server sends `/api/*` to the API over the private network, so the browser uses
one origin and the API never needs a public port. Allow inbound TCP 80 and 443
(and optionally UDP 443 for HTTP/3). Certificate state persists in the
`caddy_data` volume.

If an existing reverse proxy already owns ports 80/443, remove the `caddy`
service, attach that proxy to the Compose network, and route it to
`dashboard:8080`.

## 5. Secrets

Store these in a secrets manager, never a committed `.env`:

- `QG_ADMIN_PASSWORD_HASH` — Argon2id hash for the admin login
- `QG_SESSION_SECRET` — random session-signing secret (32+ characters)
- `QG_INGEST_TOKEN` — independent collector service credential
- `QG_ENCRYPTION_KEY` — encrypts stored DSNs; losing it means re-entering every
  monitored database connection string
- `QG_TARGET_DATABASE_URL` — least-privilege connection described in
  `docs/installation.md`

`install.sh` generates all four application secrets. It never stores the
plaintext admin password.

## 6. Backups

Back up the metadata database, not the databases being monitored. A simple
daily job is:

```bash
pg_dump "$QG_METADATA_DATABASE_URL" | gzip > "backup-$(date +%F).sql.gz"
```

The maintained wrapper is `scripts/backup-metadata-db.sh`.

## 7. Retention

Self-hosted deployments keep seven days of raw `query_stats_snapshots` by
default before rolling them into daily aggregates. Set
`QG_RAW_RETENTION_DAYS` to change this.

## 8. Monitoring the monitor

Query Guardian exposes:

- `GET /health` — API liveness
- `GET /ready` — API readiness, including metadata database connectivity

These endpoints are private by default. Run checks inside the Compose network,
or deliberately add a reverse-proxy route protected for your monitoring
system.

## 9. Scaling notes

The self-hosted OSS topology uses one collector per monitored database. For
additional targets, add collector services with distinct target URLs and names.
