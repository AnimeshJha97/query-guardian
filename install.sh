#!/bin/sh
set -eu

umask 077

if [ ! -f docker-compose.prod.yml ] || [ ! -f packages/api/Dockerfile ]; then
  echo "Run this script from the Query Guardian repository root." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker with the Compose plugin is required." >&2
  exit 1
fi

if [ -e .env ]; then
  echo ".env already exists; refusing to overwrite it." >&2
  exit 1
fi

random_secret() {
  docker run --rm node:22-alpine node -e \
    "process.stdout.write(require('node:crypto').randomBytes(Number(process.argv[1])).toString('base64url'))" "$1"
}

ADMIN_PASSWORD=$(random_secret 18)
QG_SESSION_SECRET=$(random_secret 48)
QG_INGEST_TOKEN=$(random_secret 32)
QG_ENCRYPTION_KEY=$(random_secret 32)

printf "Query Guardian domain (for example guardian.example.com): "
read -r QG_DOMAIN
printf "Metadata database URL: "
read -r QG_METADATA_DATABASE_URL
printf "Target PostgreSQL URL: "
read -r QG_TARGET_DATABASE_URL

if [ -z "$QG_DOMAIN" ] || [ -z "$QG_METADATA_DATABASE_URL" ] || [ -z "$QG_TARGET_DATABASE_URL" ]; then
  echo "Domain and both database URLs are required." >&2
  exit 1
fi

# Compose validates required substitutions even during a build.
export QG_DOMAIN QG_METADATA_DATABASE_URL QG_TARGET_DATABASE_URL
export QG_SESSION_SECRET QG_INGEST_TOKEN QG_ENCRYPTION_KEY
export QG_ADMIN_PASSWORD_HASH=bootstrap-placeholder

echo "Building the API image used to hash the generated admin password..."
docker compose -f docker-compose.prod.yml build api
QG_ADMIN_PASSWORD_HASH=$(docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -e QG_BOOTSTRAP_PASSWORD="$ADMIN_PASSWORD" api node -e \
  "import('argon2').then(async ({default:a}) => process.stdout.write(await a.hash(process.env.QG_BOOTSTRAP_PASSWORD, {type:a.argon2id})))")

cat > .env <<EOF
QG_DOMAIN=$QG_DOMAIN
QG_METADATA_DATABASE_URL=$QG_METADATA_DATABASE_URL
QG_TARGET_DATABASE_URL=$QG_TARGET_DATABASE_URL
QG_ADMIN_PASSWORD_HASH=$QG_ADMIN_PASSWORD_HASH
QG_SESSION_SECRET=$QG_SESSION_SECRET
QG_INGEST_TOKEN=$QG_INGEST_TOKEN
QG_ENCRYPTION_KEY=$QG_ENCRYPTION_KEY
QG_TARGET_SSL_MODE=verify-full
QG_CONNECTION_MODE=direct
QG_DATABASE_NAME=production
QG_LOG_LEVEL=info
QG_RAW_RETENTION_DAYS=7
EOF

echo
echo "Created .env with restrictive permissions (subject to filesystem support)."
echo "Admin password: $ADMIN_PASSWORD"
echo
echo "Save that password now; it is not stored in .env."
echo "Ensure DNS for $QG_DOMAIN points to this host and ports 80/443 are open, then run:"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
