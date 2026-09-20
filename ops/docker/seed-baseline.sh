#!/usr/bin/env bash
#
# Load the one-time baseline into an EMPTY database: school settings, rooms,
# holidays, special-ed code lists and the SUPER_ADMIN account.
#
#   ops/docker/seed-baseline.sh /path/to/baseline.sql
#
# Safe to run twice: once any user exists it does nothing. The file is a single
# BEGIN...COMMIT, so a failure part-way leaves the database unchanged.

set -euo pipefail

SQL="${1:-}"
[ -n "$SQL" ] || { echo "usage: $0 <baseline.sql>" >&2; exit 2; }
[ -f "$SQL" ] || { echo "ERROR: file not found: $SQL" >&2; exit 2; }
SQL="$(realpath "$SQL")"
cd "$(dirname "$0")/../.."

log() { printf '%s [seed] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf '%s [seed] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }
sql() { docker compose exec -T db psql -U sms -d sms -v ON_ERROR_STOP=1 -tAc "$1"; }

docker compose up -d --wait db >/dev/null

[ "$(sql "select to_regclass('public.\"User\"') is not null")" = "t" ] \
  || die "the tables do not exist yet - first run: docker compose run --rm --no-deps app node_modules/.bin/prisma db push"

users="$(sql 'select count(*) from "User"')"
if [ "$users" != "0" ]; then
  log "the database already has $users user(s) - baseline not loaded again"
  exit 0
fi

log "loading $SQL"
docker compose exec -T db psql -U sms -d sms -v ON_ERROR_STOP=1 -q < "$SQL"
log "loaded: $(sql 'select count(*) from "User"') user(s), $(sql 'select count(*) from "Room"') rooms, $(sql 'select count(*) from "GlobalSetting"') settings"
