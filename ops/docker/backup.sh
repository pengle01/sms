#!/usr/bin/env bash
#
# Back up the Docker deployment: a database dump plus uploads and logs.
#
#   ops/docker/backup.sh
#
#   BACKUP_DIR             default ~/backups/sms
#   BACKUP_RETENTION_DAYS  default 14
#
# Restore with ops/docker/restore.sh. Suitable for cron:
#   0 3 * * * $HOME/sms/ops/docker/backup.sh >> $HOME/backups/sms/backup.log 2>&1
#
# If ops/backup/offsite.sh exists and is executable it is called with
# (BACKUP_DIR, DB_DUMP, LOG_ARCHIVE, FILES_ARCHIVE), as in the bare-metal backup.

set -euo pipefail
cd "$(dirname "$0")/../.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/sms}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"

log()  { printf '%s [backup] %s\n' "$(date -Is)" "$*"; }
fail() { printf '%s [backup] ERROR: %s\n' "$(date -Is)" "$*" >&2; exit 1; }

DB_OUT="$BACKUP_DIR/db/sms_db-$TS.dump"
FILES_OUT="$BACKUP_DIR/files/files-$TS.tar.gz"
# A half-written file must never look like a good backup.
trap 'rm -f "$DB_OUT.part" "$FILES_OUT.part"' EXIT

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/files"
docker compose up -d --wait db >/dev/null

log "dumping database -> $DB_OUT"
docker compose exec -T db pg_dump -U sms -d sms --format=custom --no-owner --no-privileges > "$DB_OUT.part"
[ -s "$DB_OUT.part" ] || fail "the database dump is empty"
mv "$DB_OUT.part" "$DB_OUT"
log "database dump OK ($(du -h "$DB_OUT" | cut -f1))"

log "archiving uploads and logs -> $FILES_OUT"
docker compose run --rm --no-deps -T app tar -czf - -C /data uploads logs > "$FILES_OUT.part"
[ -s "$FILES_OUT.part" ] || fail "the files archive is empty"
mv "$FILES_OUT.part" "$FILES_OUT"
log "files archive OK ($(du -h "$FILES_OUT" | cut -f1))"

log "pruning backups older than $RETENTION days"
find "$BACKUP_DIR/db"    -type f -name '*.dump'   -mtime +"$RETENTION" -print -delete
find "$BACKUP_DIR/files" -type f -name '*.tar.gz' -mtime +"$RETENTION" -print -delete

OFFSITE="ops/backup/offsite.sh"
if [ -x "$OFFSITE" ]; then
  log "running offsite hook"
  "$OFFSITE" "$BACKUP_DIR" "$DB_OUT" "" "$FILES_OUT"
fi

log "backup complete"
