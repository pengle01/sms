#!/usr/bin/env bash
#
# Update the Docker deployment to the latest main.
#
#   ops/docker/update.sh           # update if main has moved
#   ops/docker/update.sh --force   # rebuild even when up to date
#
# Steps: preflight -> fetch -> backup -> fast-forward -> keep the running image
# as sms-app:previous -> build (the old app keeps serving) -> prisma db push ->
# start -> health check through Caddy.
#
# The schema push refuses destructive changes and stops the update while the old
# version is still running. There is no automatic rollback: after a failure the
# script prints the exact commands to go back, so a person decides.
#
# Run as your normal user (a member of the docker group), from any directory.

set -euo pipefail
cd "$(dirname "$0")/../.."

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

log()  { printf '%s [update] %s\n' "$(date +%H:%M:%S)" "$*"; }
step() { printf '\n%s [update] -- %s\n' "$(date +%H:%M:%S)" "$*"; }
die()  { printf '%s [update] ERROR: %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }
env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

# --- Preflight ----------------------------------------------------------------
step "Preflight"
[ "$(id -u)" -ne 0 ] || die "run as your normal user (in the docker group), not with sudo"
[ -f .env ] || die ".env is missing - create it: cp docker.env.example .env"
docker info >/dev/null 2>&1 \
  || die "cannot reach Docker - is your user in the docker group? (log out and back in after adding it)"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || die "checked out on '$branch', expected main"
dirty="$(git status --porcelain --untracked-files=no)"
if [ -n "$dirty" ]; then
  printf '%s\n' "$dirty" >&2
  die "the files above were changed locally and would be overwritten - commit, stash or discard them first"
fi

SMS_DOMAIN="$(env_get SMS_DOMAIN)"
[ -n "$SMS_DOMAIN" ] || die "SMS_DOMAIN is not set in .env"
HTTPS_BIND="$(env_get HTTPS_BIND)"
case "${HTTPS_BIND:-0.0.0.0}" in
  0.0.0.0|"") CHECK_ADDR=127.0.0.1 ;;
  *)          CHECK_ADDR="$HTTPS_BIND" ;;
esac

PREV_SHA="$(git rev-parse HEAD)"
log "running:  $(git log -1 --format='%h %s' HEAD)"

# --- Fetch --------------------------------------------------------------------
step "Fetch origin/main"
git fetch --quiet origin main
TARGET_SHA="$(git rev-parse origin/main)"
if [ "$TARGET_SHA" = "$PREV_SHA" ] && [ "$FORCE" -eq 0 ]; then
  log "already up to date at ${PREV_SHA:0:7} - nothing to do (--force rebuilds anyway)"
  exit 0
fi
git merge-base --is-ancestor HEAD origin/main \
  || die "origin/main does not contain the running commit ${PREV_SHA:0:7} - history has diverged, sort it out by hand"
log "target:   $(git log -1 --format='%h %s' origin/main)"
log "incoming: $(git rev-list --count HEAD..origin/main) commit(s)"

# --- Backup -------------------------------------------------------------------
step "Backup"
ops/docker/backup.sh
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/sms}"
DUMP="$(find "$BACKUP_DIR/db" -maxdepth 1 -name '*.dump' -printf '%T@ %p\n' 2>/dev/null \
  | sort -n | tail -n1 | cut -d' ' -f2-)"
[ -n "$DUMP" ] || die "backup reported success but no dump was found in $BACKUP_DIR/db"

# From here on something may change, so any failure prints the way back.
recovery() {
  local code=$?
  [ "$code" -eq 0 ] && return
  cat >&2 <<EOF

[update] FAILED (exit $code). Code was ${PREV_SHA:0:7} before this update.
See what went wrong:

  docker compose logs --tail=100 app caddy

To return to the version that was running:

  git reset --hard $PREV_SHA
  docker tag sms-app:previous sms-app:latest && docker compose up -d --no-build app

Only if the schema changed and the data now looks wrong, restore the dump taken just before:

  CONFIRM=yes ops/docker/restore.sh $DUMP

Never run 'docker compose down -v': it deletes the database, uploads and certificates.

EOF
}
trap recovery EXIT

# --- Update and build ---------------------------------------------------------
step "Update code to ${TARGET_SHA:0:7}"
git merge --ff-only --quiet origin/main

step "Keep the running image as sms-app:previous"
if docker image inspect sms-app:latest >/dev/null 2>&1; then
  docker tag sms-app:latest sms-app:previous
else
  log "no existing image (first build)"
fi

step "Build (the running app keeps serving)"
docker compose build

step "Apply schema (prisma db push - stops on destructive changes)"
docker compose run --rm --no-deps app node_modules/.bin/prisma db push

step "Start"
docker compose up -d --wait --wait-timeout 180 --remove-orphans

step "Health check https://$SMS_DOMAIN/el/login (via $CHECK_ADDR)"
code=""
for i in $(seq 1 60); do
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 \
    --resolve "$SMS_DOMAIN:443:$CHECK_ADDR" "https://$SMS_DOMAIN/el/login" || true)"
  if [ "$code" = "200" ]; then log "answered HTTP 200 after ${i}s"; break; fi
  [ "$i" -lt 60 ] || die "no healthy answer through Caddy after 60s (last HTTP ${code:-none})"
  sleep 1
done

trap - EXIT
docker image prune -f >/dev/null
step "Done"
log "running:  $(git log -1 --format='%h %s' HEAD)"
log "backup:   $DUMP"
