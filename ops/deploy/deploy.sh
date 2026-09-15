#!/usr/bin/env bash
#
# One-command manual deploy for the SMS server (proof of concept).
#
#   sudo /home/sms/app/ops/deploy/deploy.sh           # deploy if main has moved
#   sudo /home/sms/app/ops/deploy/deploy.sh --force   # rebuild even when up to date
#
# Steps: preflight -> fetch -> backup -> fast-forward to origin/main -> npm ci ->
# prisma generate -> prisma db push -> build -> restart -> health check.
#
# Deliberately simple. The build overwrites .next in place, so the running app can
# misbehave for the minute or two it takes. There is no automatic rollback: if a
# step after the code update fails, the script stops and prints the exact commands
# to go back, so a person decides.
#
# Overrides (for rehearsing on another machine):
#   APP_DIR      default /home/sms/app
#   APP_USER     default sms
#   BACKUP_DIR   default <APP_USER home>/backups/sms   (same default as backup.sh)
#   HEALTH_URL   default http://127.0.0.1:3000/el/login
#   RESTART_CMD  default "systemctl restart sms"

set -euo pipefail

APP_DIR="${APP_DIR:-/home/sms/app}"
APP_USER="${APP_USER:-sms}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/el/login}"
RESTART_CMD="${RESTART_CMD:-systemctl restart sms}"
HEALTH_TIMEOUT=60

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

log()  { printf '%s [deploy] %s\n' "$(date +%H:%M:%S)" "$*"; }
step() { printf '\n%s [deploy] -- %s\n' "$(date +%H:%M:%S)" "$*"; }
die()  { printf '%s [deploy] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }

# Run a command as the app user, inside the app directory. When already running
# as that user (a rehearsal), run it directly.
as_app() {
  if [ "$(id -un)" = "$APP_USER" ]; then
    (cd "$APP_DIR" && "$@")
  else
    sudo -u "$APP_USER" -H -- bash -c 'cd "$1" && shift && exec "$@"' _ "$APP_DIR" "$@"
  fi
}

# --- Preflight ----------------------------------------------------------------
step "Preflight"
if [ "$(id -un)" != "$APP_USER" ] && [ "$(id -u)" -ne 0 ]; then
  die "run with sudo: the app is built as '$APP_USER' and the service is restarted as root"
fi
id "$APP_USER" >/dev/null 2>&1 || die "user '$APP_USER' does not exist"
[ -d "$APP_DIR/.git" ] || die "$APP_DIR is not a git checkout"
[ -f "$APP_DIR/.env" ] || die "$APP_DIR/.env is missing - create it from .env.production.example first"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
BACKUP_DIR="${BACKUP_DIR:-$APP_HOME/backups/sms}"

branch="$(as_app git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || die "checked out on '$branch', expected main"

# Tracked files only: .env, logs/ and uploads/ are gitignored and belong there.
dirty="$(as_app git status --porcelain --untracked-files=no)"
if [ -n "$dirty" ]; then
  printf '%s\n' "$dirty" >&2
  die "the files above were changed locally in $APP_DIR and would be overwritten - commit, stash or discard them first"
fi

PREV_SHA="$(as_app git rev-parse HEAD)"
log "app:      $APP_DIR (built as $APP_USER)"
log "running:  $(as_app git log -1 --format='%h %s' HEAD)"

# --- Fetch --------------------------------------------------------------------
step "Fetch origin/main"
as_app git fetch --quiet origin main
TARGET_SHA="$(as_app git rev-parse origin/main)"

if [ "$TARGET_SHA" = "$PREV_SHA" ] && [ "$FORCE" -eq 0 ]; then
  log "already up to date at ${PREV_SHA:0:7} - nothing to do (--force rebuilds anyway)"
  exit 0
fi
as_app git merge-base --is-ancestor HEAD origin/main \
  || die "origin/main does not contain the running commit ${PREV_SHA:0:7} - history has diverged, sort it out by hand"
log "target:   $(as_app git log -1 --format='%h %s' origin/main)"
log "incoming: $(as_app git rev-list --count HEAD..origin/main) commit(s)"

# --- Backup -------------------------------------------------------------------
step "Backup database, logs and uploads"
as_app env BACKUP_DIR="$BACKUP_DIR" bash ops/backup/backup.sh
DUMP="$(find "$BACKUP_DIR/db" -maxdepth 1 -name '*.dump' -printf '%T@ %p\n' 2>/dev/null \
  | sort -n | tail -n1 | cut -d' ' -f2-)"
[ -n "$DUMP" ] || die "backup reported success but no dump was found in $BACKUP_DIR/db"

# From here on the code may change, so any failure prints the way back.
recovery() {
  local code=$?
  [ "$code" -eq 0 ] && return
  cat >&2 <<EOF

[deploy] FAILED (exit $code). Code is at $(as_app git rev-parse --short HEAD 2>/dev/null || echo '?'); it was ${PREV_SHA:0:7} before this deploy.
To return to the version that was running:

  cd $APP_DIR
  sudo -u $APP_USER git reset --hard $PREV_SHA
  sudo -u $APP_USER bash -c 'npm ci && npm run db:generate && npm run build'
  sudo $RESTART_CMD

Only if the schema changed and the data now looks wrong, restore the dump taken just before:

  cd $APP_DIR
  sudo -u $APP_USER env CONFIRM=yes bash ops/backup/restore-db.sh $DUMP

EOF
}
trap recovery EXIT

# --- Update and build ---------------------------------------------------------
step "Update code to ${TARGET_SHA:0:7}"
as_app git merge --ff-only --quiet origin/main

step "Install dependencies (npm ci)"
as_app npm ci --no-audit --no-fund

step "Generate Prisma client"
as_app npm run --silent db:generate

step "Apply schema (prisma db push - stops on destructive changes)"
as_app npx prisma db push

step "Production build"
as_app npm run build

# --- Restart and check --------------------------------------------------------
step "Restart"
bash -c "$RESTART_CMD"

step "Health check $HEALTH_URL"
code=""
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)"
  case "$code" in
    200|302|307|308) log "answered HTTP $code after ${i}s"; break ;;
  esac
  if [ "$i" -eq "$HEALTH_TIMEOUT" ]; then
    die "no healthy answer after ${HEALTH_TIMEOUT}s (last HTTP ${code:-none}) - check: journalctl -u sms -n 50"
  fi
  sleep 1
done

trap - EXIT
step "Done"
log "running:  $(as_app git log -1 --format='%h %s' HEAD)"
log "backup:   $DUMP"
