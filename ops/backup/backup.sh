#!/usr/bin/env bash
#
# SMS backup — database (pg_dump) + application logs + uploaded files.
#
# - DB:      compressed custom-format dump (restore with ops/backup/restore-db.sh)
# - Logs:    a gzipped tar of the live log directory
# - Uploads: a gzipped tar of UPLOADS_DIR (noticeboard attachments). The DB only
#            stores a filename — without these bytes a restored database has
#            attachment rows pointing at nothing.
# - Retention: prunes all three older than BACKUP_RETENTION_DAYS
# - Offsite: if ops/backup/offsite.sh exists and is executable, it is called with
#            (BACKUP_DIR, DB_DUMP_PATH, LOG_ARCHIVE_PATH, UPLOADS_ARCHIVE_PATH)
#            to copy off the machine.
#
# Configuration (env, with defaults):
#   DATABASE_URL              read from the project .env if not already set
#   BACKUP_DIR                default: $HOME/backups/sms
#   BACKUP_RETENTION_DAYS     default: 14
#   LOG_DIR                   default: <project>/logs
#   UPLOADS_DIR               read from the project .env if not already set
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

# --- Resolve UPLOADS_DIR (from env, else the project .env, else the default) --
if [ -z "${UPLOADS_DIR:-}" ] && [ -f "$PROJECT_DIR/.env" ]; then
  UPLOADS_DIR="$(grep -E '^UPLOADS_DIR=' "$PROJECT_DIR/.env" | tail -n1 | cut -d= -f2- \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
fi
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_DIR/uploads}"

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found on PATH"

TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/logs" "$BACKUP_DIR/uploads"

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

# --- Uploads archive ---------------------------------------------------------
# Attachments referenced by the database. Missing/empty is normal on a fresh
# install, but is NOT treated as an error.
UPLOADS_OUT=""
if [ -d "$UPLOADS_DIR" ] && [ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  UPLOADS_OUT="$BACKUP_DIR/uploads/uploads-$TS.tar.gz"
  log "archiving uploads -> $UPLOADS_OUT"
  tar -czf "$UPLOADS_OUT" -C "$UPLOADS_DIR" .
  log "uploads archive OK ($(du -h "$UPLOADS_OUT" | cut -f1))"
else
  log "no uploads to archive (UPLOADS_DIR=$UPLOADS_DIR empty or missing)"
fi

# --- Retention ---------------------------------------------------------------
log "pruning backups older than ${BACKUP_RETENTION_DAYS} days"
find "$BACKUP_DIR/db"   -type f -name '*.dump'   -mtime +"$BACKUP_RETENTION_DAYS" -print -delete || true
find "$BACKUP_DIR/logs" -type f -name '*.tar.gz' -mtime +"$BACKUP_RETENTION_DAYS" -print -delete || true
find "$BACKUP_DIR/uploads" -type f -name '*.tar.gz' -mtime +"$BACKUP_RETENTION_DAYS" -print -delete || true

# --- Offsite copy (optional) -------------------------------------------------
OFFSITE="$SCRIPT_DIR/offsite.sh"
if [ -x "$OFFSITE" ]; then
  log "running offsite hook"
  "$OFFSITE" "$BACKUP_DIR" "$DB_OUT" "$LOG_OUT" "$UPLOADS_OUT"
  log "offsite hook OK"
else
  log "no offsite hook (create $OFFSITE from offsite.sh.example to enable)"
fi

trap - ERR
log "backup complete"
