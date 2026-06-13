#!/usr/bin/env bash
#
# SMS backup — database (pg_dump) + application logs.
#
# - DB:   compressed custom-format dump (restore with ops/backup/restore-db.sh)
# - Logs: a gzipped tar of the live log directory
# - Retention: prunes both older than BACKUP_RETENTION_DAYS
# - Offsite: if ops/backup/offsite.sh exists and is executable, it is called with
#            (BACKUP_DIR, DB_DUMP_PATH, LOG_ARCHIVE_PATH) to copy off the machine.
#
# Configuration (env, with defaults):
#   DATABASE_URL              read from the project .env if not already set
#   BACKUP_DIR                default: $HOME/backups/sms
#   BACKUP_RETENTION_DAYS     default: 14
#   LOG_DIR                   default: <project>/logs
#
# Exits non-zero on failure so the systemd unit / cron is marked failed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/sms}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/logs}"

log() { printf '%s [backup] %s\n' "$(date -Is)" "$*"; }
fail() { printf '%s [backup] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }
trap 'fail "backup failed at line $LINENO"' ERR

# --- Resolve DATABASE_URL (from env, else the project .env) -------------------
if [ -z "${DATABASE_URL:-}" ] && [ -f "$PROJECT_DIR/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | tail -n1 | cut -d= -f2- \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  export DATABASE_URL
fi
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set and not found in $PROJECT_DIR/.env"

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found on PATH"

TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/logs"

# --- Database dump (custom format = compressed, restorable with pg_restore) ---
DB_OUT="$BACKUP_DIR/db/sms_db-$TS.dump"
log "dumping database -> $DB_OUT"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$DB_OUT"
log "database dump OK ($(du -h "$DB_OUT" | cut -f1))"

# --- Logs archive ------------------------------------------------------------
LOG_OUT=""
if [ -d "$LOG_DIR" ] && [ -n "$(ls -A "$LOG_DIR" 2>/dev/null)" ]; then
  LOG_OUT="$BACKUP_DIR/logs/logs-$TS.tar.gz"
  log "archiving logs -> $LOG_OUT"
  tar -czf "$LOG_OUT" -C "$LOG_DIR" .
  log "logs archive OK ($(du -h "$LOG_OUT" | cut -f1))"
else
  log "no logs to archive (LOG_DIR=$LOG_DIR empty or missing)"
fi

# --- Retention ---------------------------------------------------------------
log "pruning backups older than ${BACKUP_RETENTION_DAYS} days"
find "$BACKUP_DIR/db"   -type f -name '*.dump'   -mtime +"$BACKUP_RETENTION_DAYS" -print -delete || true
find "$BACKUP_DIR/logs" -type f -name '*.tar.gz' -mtime +"$BACKUP_RETENTION_DAYS" -print -delete || true

# --- Offsite copy (optional) -------------------------------------------------
OFFSITE="$SCRIPT_DIR/offsite.sh"
if [ -x "$OFFSITE" ]; then
  log "running offsite hook"
  "$OFFSITE" "$BACKUP_DIR" "$DB_OUT" "$LOG_OUT"
  log "offsite hook OK"
else
  log "no offsite hook (create $OFFSITE from offsite.sh.example to enable)"
fi

trap - ERR
log "backup complete"
