# Installation & Getting Started

## Requirements

- Docker + Docker Compose v2
- A Postgres database to monitor (v13+; `pg_stat_statements` support required, `auto_explain` optional but recommended)
- Node.js 20+ (only needed if you plan to run packages outside Docker, e.g. for development)

## Installing Docker

Query Guardian uses Docker Compose v2, so the command should be
`docker compose`, not the older `docker-compose`.

### Windows

Use Docker Desktop with the WSL 2 backend.

1. Confirm your machine has hardware virtualization enabled in BIOS/UEFI.
2. Open PowerShell and install or update WSL:
   ```powershell
   wsl --install
   wsl --update
   ```
3. Restart Windows if either command asks you to.
4. Download Docker Desktop for Windows from:
   <https://docs.docker.com/desktop/setup/install/windows-install/>
5. Run `Docker Desktop Installer.exe`.
6. Choose the default WSL 2 backend when the installer asks.
7. Start Docker Desktop from the Start menu and accept the Docker terms.
8. Open a new PowerShell window and verify Docker:
   ``` powershell
   docker --version
   docker compose version
   docker run hello-world
   ```

If Docker says WSL is not ready, open Docker Desktop, go to
**Settings -> Resources -> WSL integration**, enable integration for your
default Linux distribution, then retry the verification commands.

### macOS

Use Docker Desktop for Mac.

1. Check whether your Mac uses Apple silicon or Intel:
   ```bash
   uname -m
   ```
   `arm64` means Apple silicon; `x86_64` means Intel.
2. Download the matching Docker Desktop installer from:
   <https://docs.docker.com/desktop/setup/install/mac-install/>
3. Open `Docker.dmg`.
4. Drag Docker into the Applications folder.
5. Open Docker from Applications and accept the Docker terms.
6. Use the recommended settings unless you have a reason to customize them.
7. Open Terminal and verify Docker:
   ```bash
   docker --version
   docker compose version
   docker run hello-world
   ```

### Linux

On Linux servers, install Docker Engine and the Compose plugin. The commands
below are for Ubuntu systems using `apt`; for Debian, Fedora, RHEL, Arch, or
Docker Desktop for Linux, use the matching Docker docs page:
<https://docs.docker.com/engine/install/>

1. Remove older conflicting packages if they exist:
   ```bash
   sudo apt remove docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc
   ```
   It is fine if `apt` says some packages are not installed.
2. Add Docker's official repository:
   ```bash
   sudo apt update
   sudo apt install -y ca-certificates curl
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc

   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt update
   ```
3. Install Docker Engine, Buildx, and Compose v2:
   ```bash
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```
4. Start Docker:
   ```bash
   sudo systemctl enable --now docker
   ```
5. Verify Docker:
   ```bash
   sudo docker --version
   sudo docker compose version
   sudo docker run hello-world
   ```
6. Optional, but convenient for development: let your user run Docker without
   `sudo`.
   ```bash
   sudo usermod -aG docker "$USER"
   newgrp docker
   docker run hello-world
   ```

Adding your user to the `docker` group grants broad access to the Docker
daemon. On a shared server, treat that permission like administrator access.

## Try it with the built-in demo (2 minutes)

```bash
git clone <your-fork-url> query-guardian
cd query-guardian
cp .env.example .env
# Replace every placeholder in .env using the generation commands in that file.
docker compose up --build
```

The committed `.env.example` contains variable names and generation commands,
not working credentials. Keep your populated `.env` local; it is excluded by
`.gitignore`.

This starts a demo Postgres instance (pre-configured with
`pg_stat_statements` and `auto_explain`, seeded with a schema deliberately
shaped to produce a real N+1 pattern and a missing-index slow query), the
collector, the API, and the dashboard.

Generate some traffic so there's something to see:
```bash
node scripts/seed-workload.mjs
```

Wait one poll cycle (30s by default), then open **http://localhost:5173**.

## Connecting your own database

Don't point Query Guardian at a superuser connection string. Create a
dedicated, least-privilege role first:

```sql
CREATE ROLE query_guardian_reader LOGIN PASSWORD '<a strong password>';
GRANT pg_read_all_stats TO query_guardian_reader;
GRANT CONNECT ON DATABASE your_database TO query_guardian_reader;
GRANT USAGE ON SCHEMA public TO query_guardian_reader;

-- Only if you want live EXPLAIN support (not required for stats/N+1 detection):
GRANT SELECT ON ALL TABLES IN SCHEMA public TO query_guardian_reader;
```

Then enable the extensions/logging you want:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```
```ini
# postgresql.conf — requires a restart, not just reload
shared_preload_libraries = 'pg_stat_statements,auto_explain'
auto_explain.log_min_duration = '200ms'   -- tune per your workload
auto_explain.log_analyze = on
auto_explain.log_format = 'json'
```

In the dashboard, go to **Connect database** and paste the connection
string using the role above (e.g.
`postgres://query_guardian_reader:***@your-host:5432/your_database?sslmode=verify-full`).
The setup wizard checks each required permission and tells you exactly
what's missing if the connection isn't ready yet.

See `docs/architecture.md` section 3 for the full reasoning behind each
grant, and why Query Guardian never needs write access to your database.

## Configuration reference

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `QG_ADMIN_PASSWORD_HASH` | api | — (required) | Argon2id hash of the self-hosted admin password |
| `QG_SESSION_SECRET` | api | — (required) | Random session-signing secret, at least 32 characters |
| `QG_INGEST_TOKEN` | api | — (required) | Random service credential accepted only by `/api/ingest` |
| `QG_ENCRYPTION_KEY` | api | — (required in production) | 32-byte AES-256-GCM key for stored DSNs at rest |
| `QG_METADATA_DATABASE_URL` | api | — (required) | Query Guardian's own storage, separate from monitored DBs |
| `QG_TARGET_DATABASE_URL` | collector | — (required) | The database being monitored |
| `QG_TARGET_SSL_MODE` | collector | `verify-full` | `require` or `verify-full`; `disable` is reserved for the bundled Compose demo |
| `QG_CONNECTION_MODE` | collector | `both` | `direct`, `log_tail`, or `both` |
| `QG_POLL_INTERVAL_MS` | collector | `30000` | `pg_stat_statements` polling interval |
| `QG_API_INGEST_URL` | collector | `http://api:4000/api/ingest` | Where the collector posts batches |
| `QG_API_TOKEN` | collector | — (required) | Bearer token for ingest; set to the API's `QG_INGEST_TOKEN` |
| `QG_DATABASE_NAME` | collector | `demo` | Display name the collector registers itself under |
| `QG_AUTO_EXPLAIN_LOG_PATH` | collector | — | Path to the auto_explain log file/mount |
| `QG_LOG_LEVEL` | api, collector | `info` | Pino log level |

Generate a production encryption key with:
```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## Production deployment

The Compose file in this repo (`docker-compose.yml`) is a **demo/dev**
stack — it includes a seeded demo database and runs the dashboard's dev
server. For a real deployment, see `docs/deployment.md`.

## Upgrading

Check `CHANGELOG.md` before upgrading across minor versions — schema
migrations run automatically on `api` startup, but a migration that
drops or renames a column will be called out there with a manual step if
needed.

## Troubleshooting

**Dashboard shows no queries after a while.**
Check the collector's logs (`docker compose logs collector`). Most common
cause: the `query_guardian_reader` role can't read `pg_stat_statements`
because the extension isn't created, or `shared_preload_libraries` wasn't
set before Postgres last restarted (this setting requires a restart, not
a reload).

**No EXPLAIN plans captured, only stats.**
`auto_explain` requires `shared_preload_libraries` to include it *and* a
restart. Confirm `auto_explain.log_min_duration` isn't set so high that
your workload never trips it — start low (e.g. `50ms`) to confirm the
pipeline works, then raise it to a threshold that matches what you
actually consider "slow."

**Connection fails with an SSL error.**
Managed Postgres providers (RDS, Cloud SQL, etc.) usually require
`sslmode=require` or `verify-full` with their CA bundle. Check your
provider's docs for the exact SSL requirements before assuming Query
Guardian is misconfigured.
