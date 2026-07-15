#!/usr/bin/env sh
set -eu

if [ -z "${QG_METADATA_DATABASE_URL:-}" ]; then
  echo "QG_METADATA_DATABASE_URL is required" >&2
  exit 1
fi

backup_dir="${QG_BACKUP_DIR:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$backup_dir/query-guardian-metadata-$timestamp.dump"

mkdir -p "$backup_dir"
umask 077
pg_dump --dbname="$QG_METADATA_DATABASE_URL" --format=custom --compress=9 --file="$output"
echo "$output"

