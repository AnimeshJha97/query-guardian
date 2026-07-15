#!/bin/sh
set -eu

# Docker creates a named volume as root. Make the dedicated logging volume
# writable before handing control to the official entrypoint, which then
# drops privileges to the postgres user for the database server.
mkdir -p /var/lib/postgresql/log
chown postgres:postgres /var/lib/postgresql/log

exec docker-entrypoint.sh "$@"
