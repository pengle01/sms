#!/usr/bin/env bash
#
# Restore the Docker deployment from files made by ops/docker/backup.sh.
#
#   CONFIRM=yes ops/docker/restore.sh <db.dump> [files.tar.gz]
#
# DANGER: overwrites the current database, and (if a files archive is given)
# replaces all uploads and logs. The app is stopped while this runs.

set -euo pipefail

DUMP="${1:-}"
FILES="${2:-}"
[ -n "$DUMP" ] || { echo "usage: CONFIRM=yes $0 <db.dump> [files.tar.gz]" >&2; exit 2; }
[ -f "$DUMP" ] || { echo "ERROR: dump not found: $DUMP" >&2; exit 2; }
[ -z "$FILES" ] || [ -f "$FILES" ] || { echo "ERROR: files archive not found: $FILES" >&2; exit 2; }
if [ "${CONFIRM:-}" != "yes" ]; then
  echo "Refusing to restore without CONFIRM=yes (this OVERWRITES the database)." >&2
  exit 2
fi
DUMP="$(realpath "$DUMP")"
[ -z "$FILES" ] || FILES="$(realpath "$FILES")"
cd "$(dirname "$0")/../.."

log() { printf '%s [restore] %s\n' "$(date +%H:%M:%S)" "$*"; }

docker compose up -d --wait db >/dev/null
log "stopping the app"
docker compose stop app

log "restoring database from $DUMP"
docker compose exec -T db pg_restore -U sms -d sms --clean --if-exists --no-owner --no-privileges --single-transaction < "$DUMP"

if [ -n "$FILES" ]; then
  log "restoring uploads and logs from $FILES"
  docker compose run --rm --no-deps -T app \
    sh -c 'find /data/uploads /data/logs -mindepth 1 -delete && tar -xzf - -C /data' < "$FILES"
fi

log "starting the app"
docker compose up -d --wait app
log "restore complete"
