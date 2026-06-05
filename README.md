# School Management System (SMS)

Multi-portal school management system for a Cypriot technical school (~1000 students).
Greek-first UI (English available), one portal per role:

| Portal | URL prefix | Roles |
|---|---|---|
| Administration | `/admin` | SUPER_ADMIN |
| Educators | `/teacher` | HEADMASTER, HEADTEACHER_A/B, STUDENT_COUNSELOR, TEACHER |
| Office | `/office` | SCHOOL_ADMIN |
| Students | `/student` | STUDENT |
| Parents | `/parent` | PARENT |
| Chaperones | `/chaperone` | CHAPERONE |

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · NextAuth v4 · Prisma 7 · PostgreSQL · tRPC 11 · next-intl · Tailwind 4 · Vitest

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **20 LTS or newer** | includes npm |
| PostgreSQL | **15 or newer** | local server is fine |
| Git | any recent | |

### Windows

```powershell
# with winget (or download the installers from nodejs.org / postgresql.org)
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL.16
winget install Git.Git
```

- During the PostgreSQL install, note the password you set for the `postgres` superuser.
- Open a **new** terminal afterwards so `node`, `npm` and `psql` are on PATH.
  If `psql` is missing, add `C:\Program Files\PostgreSQL\16\bin` to PATH.

### Ubuntu

```bash
# Node 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git postgresql postgresql-contrib

sudo systemctl enable --now postgresql
```

---

## 2. Create the database

Create a database (and optionally a dedicated user) named e.g. `sms`:

**Windows** (PowerShell — enter the `postgres` password when prompted):

```powershell
psql -U postgres -c "CREATE DATABASE sms;"
# optional dedicated user:
psql -U postgres -c "CREATE USER sms_user WITH PASSWORD 'change-me';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE sms TO sms_user; ALTER DATABASE sms OWNER TO sms_user;"
```

**Ubuntu:**

```bash
sudo -u postgres psql -c "CREATE DATABASE sms;"
# optional dedicated user:
sudo -u postgres psql -c "CREATE USER sms_user WITH PASSWORD 'change-me';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sms TO sms_user; ALTER DATABASE sms OWNER TO sms_user;"
```

---

## 3. Clone & install

```bash
git clone git@github.com:pengle01/sms.git
cd sms
npm install
```

(Same commands in PowerShell on Windows.)

---

## 4. Environment files

Two files in the project root. **Neither is committed — create them by hand.**

### `.env` — read by the Prisma CLI (`db:push`, `db:generate`, Studio)

```env
DATABASE_URL="postgresql://sms_user:change-me@localhost:5432/sms"
```

### `.env.local` — read by the Next.js app

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL="postgresql://sms_user:change-me@localhost:5432/sms"

# ── Auth ──────────────────────────────────────────────────
# Generate with:  openssl rand -base64 32   (Git Bash works on Windows)
NEXTAUTH_SECRET="<random-32-byte-string>"
AUTH_TRUST_HOST=true

# Production-only: Microsoft Entra ID SSO for staff (dev uses a bypass login)
AZURE_AD_CLIENT_ID=""
AZURE_AD_CLIENT_SECRET=""
AZURE_AD_TENANT_ID=""

# ── SMS gateway (WebSMS / Cytacom) — optional in dev ──────
SMS_GATEWAY_URL=""
SMS_GATEWAY_USER=""
SMS_GATEWAY_PASS=""

# ── File storage ──────────────────────────────────────────
# Windows example: UPLOADS_DIR="C:\\sms\\uploads"
UPLOADS_DIR="/var/sms/uploads"

# ── Dev date override (optional) ──────────────────────────
# Fakes "today" everywhere (schedules, attendance, terms, tests).
# Comment out to use the real date. Format: YYYY-MM-DD.
# NEXT_PUBLIC_TEST_DATE="2026-03-09"
```

Create the uploads directory and make sure the app can write to it
(`mkdir -p /var/sms/uploads` / `mkdir C:\sms\uploads`).

> Email (activation OTPs) is configured later from **Admin → Settings** or via
> `EMAIL_SMTP_HOST/PORT/USER/PASS` + `EMAIL_FROM` env vars. In development the
> OTP is printed to the dev-server console, so no SMTP is needed to test.

---

## 5. Initialize the database schema

This project uses `prisma db push` (no migration files):

```bash
npm run db:push       # create/sync all tables
npm run db:generate   # generate the Prisma client into src/generated/prisma
```

> **Always after any schema change:** `npm run db:generate`, then delete the
> `.next` folder and restart the dev server — otherwise you get stale
> `PrismaClientValidationError`s.
> Ubuntu: `rm -rf .next` · Windows: `Remove-Item -Recurse -Force .next`

---

## 6. Create the first SUPER_ADMIN

There is no seed script; create the first admin account directly:

```bash
npm run db:studio    # opens Prisma Studio in the browser
```

In the **User** table add a row with:

| field | value |
|---|---|
| `email` | your email (lowercase) |
| `name` | your name |
| `role` | `SUPER_ADMIN` |
| `isActive` | `true` |

Everything else can stay at the defaults.

---

## 7. Run it

```bash
npm run dev
```

Open <http://localhost:3000> → you are redirected to `/el/login`.

**Logging in during development:**

- **Staff (incl. your new SUPER_ADMIN):** use the *"Microsoft (Dev bypass)"*
  login — enter just the email of an existing active user, no password.
  In production this is replaced by real Microsoft Entra ID SSO.
- **Students / Parents / Chaperones:** email + password, created through the
  access-code activation flow (`/activate`); the OTP email is printed to the
  dev-server console.

**First-run data flow** (as the SUPER_ADMIN in `/admin`):

1. **Settings** — school name, school year & term dates, periods per day, duty roster, grade-entry unlock.
2. **Timetable → Import** — upload the master weekly programme; this also seeds the staff schedule names (e.g. `ΗΥ-ΜΑΣΙΑ Μ. ΒΔ`).
3. **Students → Import / Enrollment** — student records and group enrollments.
4. Teachers self-register, claim their schedule name, and you approve them under **Claims**.
5. Generate **access codes** for students/parents (visible per student).

---

## 8. Tests & checks

```bash
npm run test        # Vitest unit suite (src/test/unit)
npm run test:watch
npx tsc --noEmit    # typecheck — see "Known quirks" below
npm run lint
```

---

## 9. Accessing from a phone / another device on the LAN

1. Add your machine's LAN IP to `allowedDevOrigins` in `next.config.ts`
   (otherwise Turbopack blocks the JS chunks cross-origin).
2. Open `http://<lan-ip>:3000` on the device.
   Dev cookies are non-Secure on purpose so plain-HTTP mobile login works.

---

## 10. Known quirks

- **Stale Prisma client / stale build:** after `db:push`+`db:generate` or when
  pages error inexplicably → stop the server, delete `.next`, start again.
- **`tsc` noise:** plain `npx tsc --noEmit` reports `TS2307: Cannot find module
  '@/generated/prisma'` across many files. This is a tsc-vs-Turbopack module
  resolution mismatch — the app builds and runs fine. Filter them out when
  typechecking.
- **`prisma migrate dev` is not used.** Schema changes go through `db:push` only.
- **Dates:** the app treats date-only values as UTC midnight (`utcMidnight()` in
  `src/lib/dates.ts`) because the school runs at UTC+3. Never use
  `setHours(0,0,0,0)`.
- **`NEXT_PUBLIC_TEST_DATE`** time-travels the entire app (attendance "today",
  duty roster, terms, upcoming/past tests). Remember it's set before debugging
  anything date-related; restart the dev server after changing it.

---

## 11. Production notes (not yet wired)

- Replace the dev bypass login with `AzureADProvider` in `src/server/auth.ts`
  (the `AZURE_AD_*` env vars), behind HTTPS.
- Configure SMTP (Admin → Settings or `EMAIL_SMTP_*`) for real OTP delivery.
- `npm run build && npm run start`; set `NODE_ENV=production` so secure
  cookies and the production auth rules apply.
