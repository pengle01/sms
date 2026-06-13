#!/usr/bin/env bash
#
# Restore the SMS database from a pg_dump custom-format file produced by backup.sh.
#
#   ops/backup/restore-db.sh <path-to.dump>
#
# DANGER: this overwrites the current database (drops & recreates objects).
# It refuses to run unless CONFIRM=yes is set:
#
#   CONFIRM=yes ops/backup/restore-db.sh ~/backups/sms/db/sms_db-20260613-030000.dump
#
# DATABASE_URL is taken from the environment, else the project .env.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

DUMP="${1:-}"
[ -n "$DUMP" ] || { echo "usage: CONFIRM=yes $0 <path-to.dump>" >&2; exit 2; }
[ -f "$DUMP" ] || { echo "ERROR: dump file not found: $DUMP" >&2; exit 2; }

if [ "${CONFIRM:-}" != "yes" ]; then
  echo "Refusing to restore without CONFIRM=yes (this OVERWRITES the database)." >&2
  exit 2
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f "$PROJECT_DIR/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | tail -n1 | cut -d= -f2- \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  export DATABASE_URL
fi
[ -n "${DATABASE_URL:-}" ] || { echo "ERROR: DATABASE_URL not set" >&2; exit 2; }

command -v pg_restore >/dev/null 2>&1 || { echo "ERROR: pg_restore not found" >&2; exit 2; }

echo "Restoring $DUMP into the configured database…"
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$DUMP"
echo "Restore complete. Run 'npm run db:generate' if the schema changed."
