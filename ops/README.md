# Operations — logging & backups

## Logging

The app logs structured JSON via `pino` (`src/server/logger.ts`).

- **Where:** stdout **and** `logs/app.log` (relative to the project root, override with `LOG_DIR`).
- **Level:** `LOG_LEVEL` env (default `info` in production, `debug` in dev).
- **Coverage:**
  - All unhandled server errors (Server Components, Route Handlers, Server Actions) via `src/instrumentation.ts` `onRequestError`.
  - Every tRPC call: failures (server faults at `error` with stack, client faults at `warn`) and slow calls (>1s) — `src/server/trpc/init.ts`.
  - Auth (login success/failure/rate-limit, no PII) — `src/server/auth.ts`.
  - Audit-write failures, email/SMS send failures + unconfigured warnings, message-notification + activation failures.
- **PII:** the logger redacts `password`/`passwordHash`/`token`/`otp`/`email`/`phone` keys. Prefer logging `userId` over personal data.

Pretty output in dev: `npm run dev | npx pino-pretty` (pino-pretty is not a dependency; npx fetches it on demand).

### Log rotation (logrotate)

```bash
sudo cp ops/logrotate/sms /etc/logrotate.d/sms
sudo logrotate --debug /etc/logrotate.d/sms   # dry run
```

Rotates `logs/app.log` daily, keeps 14 compressed, uses `copytruncate` (no app restart needed).

## Backups

`ops/backup/backup.sh` dumps the database (compressed, restorable) and archives the logs, prunes anything older than the retention window, then runs an optional offsite hook.

| Setting | Default | Meaning |
| --- | --- | --- |
| `BACKUP_DIR` | `$HOME/backups/sms` | where dumps + log archives go |
| `BACKUP_RETENTION_DAYS` | `14` | prune older than this |
| `LOG_DIR` | `<project>/logs` | logs to archive |
| `DATABASE_URL` | from `.env` | source DB |

### Run manually

```bash
npm run backup
# or with overrides:
BACKUP_DIR=/data/backups/sms BACKUP_RETENTION_DAYS=30 bash ops/backup/backup.sh
```

### Schedule (systemd timer — daily 03:00)

```bash
sudo cp ops/systemd/sms-backup.service /etc/systemd/system/
sudo cp ops/systemd/sms-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sms-backup.timer

systemctl list-timers sms-backup.timer   # confirm next run
journalctl -u sms-backup.service          # see backup output
sudo systemctl start sms-backup.service   # run once now
```

Edit the `User`, `WorkingDirectory`, and `ExecStart` paths in the `.service` file if the project isn't at `/home/pengle01/projects/sms`.

### Offsite copies (recommended)

Local backups don't survive losing this machine. To copy off-site:

```bash
cp ops/backup/offsite.sh.example ops/backup/offsite.sh
chmod +x ops/backup/offsite.sh
# edit it: rclone / rsync / second disk (examples inside)
```

`offsite.sh` is gitignored (it holds destinations/credentials). `backup.sh` calls it automatically after each successful local backup.

### Restore (DANGER — overwrites the DB)

```bash
CONFIRM=yes ops/backup/restore-db.sh ~/backups/sms/db/sms_db-YYYYmmdd-HHMMSS.dump
npm run db:generate   # if the schema changed
```
