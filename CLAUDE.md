@AGENTS.md

# School Management System — Claude Guide

## Project Overview

A school management system for a Cypriot school (~1000 students). UI language is Greek (el) with English (en) support via `next-intl`. The app is multi-portal: each role has its own portal prefix in the URL.

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | Next.js App Router | 16.2.6 |
| Auth | NextAuth v4 + Prisma adapter | ^4 |
| ORM | Prisma v7 | ^7 |
| Database | PostgreSQL (via `pg`) | — |
| API | tRPC v11 + React Query v5 | ^11 / ^5 |
| i18n | next-intl | ^4 |
| UI | shadcn/ui + Tailwind v4 | — |
| Testing | Vitest | ^4 |

## Development

```bash
npm run dev          # start dev server (Turbopack)
npm run test         # run all tests once
npm run test:watch   # run tests in watch mode
npm run db:push      # apply schema changes (NO migration files — use db push, not migrate dev)
npm run db:generate  # regenerate Prisma client after schema change
npm run db:studio    # Prisma Studio GUI
```

**After any schema change:** always run `db:generate`, then `rm -rf .next` to clear the Turbopack cache, otherwise you get stale `PrismaClientValidationError`.

## Project Structure

```
src/
  app/[locale]/
    (portal)/
      admin/       — SUPER_ADMIN only
      teacher/     — educator roles (HEADMASTER, HEADTEACHER_A/B, STUDENT_COUNSELOR, TEACHER)
      office/      — SCHOOL_ADMIN
      student/     — STUDENT
      parent/      — PARENT
      chaperone/   — CHAPERONE
  components/
    layout/        — sidebar, shell components
    ui/            — shadcn primitives (Button, Card, Badge, …)
  lib/
    rbac.ts        — role hierarchy, portal routing, permission helpers
    dates.ts       — utcMidnight() — always use this for date-only values (UTC+3 timezone)
    utils.ts       — cn() Tailwind merge helper
  server/
    auth.ts        — NextAuth authOptions
    db.ts          — Prisma client singleton
    trpc/
      routers/     — one router per domain
  trpc/            — client-side tRPC setup
  test/
    unit/          — pure-logic Vitest tests (no DB)
    setup.ts       — global Prisma mock for unit tests
messages/
  el.json          — Greek strings (primary)
  en.json          — English strings
prisma/
  schema.prisma    — single source of truth; use db push not migrate
```

## Roles and Portals

```
SUPER_ADMIN        → /admin   — system config, user management, claims
HEADMASTER         → /teacher — full educator access
HEADTEACHER_A      → /teacher — educator + management
HEADTEACHER_B      → /teacher — educator + management + homegroup headteacher
STUDENT_COUNSELOR  → /teacher — counselor-specific views
TEACHER            → /teacher — own timetable, referrals, grades
SCHOOL_ADMIN       → /office  — attendance, student records
STUDENT            → /student
PARENT             → /parent
CHAPERONE          → /chaperone
```

The portal prefix is determined by `getPortalForRole()` in `src/lib/rbac.ts`.

## Key Conventions

### Auth and session
- Use `getServerSession(authOptions)` in server components and server actions.
- Always check role before any data access. Redirect to `/${locale}/login` on auth failure.
- `session.user.role` is typed as `string`; cast to `Role` from `@/generated/prisma` when needed.

### Next.js App Router (v16)
- `params` and `searchParams` are both `Promise<…>` — always `await` them.
- Prefer server components. Use `"use client"` only for interactivity (dropdowns, forms with `useTransition`).
- Server actions live in co-located `actions.ts` files; always call `getServerSession` + role check inside.

### Prisma
- Import types from `@/generated/prisma`, NOT from `@prisma/client`.
- `StaffProfile.userId` is nullable — a profile can exist without a linked user (substitute cover). Always use `user?.name`, never `user.name`.
- Use `db push` + `db generate` for schema changes. Never use `migrate dev` in development.

### i18n
- All user-facing strings go in `messages/el.json` AND `messages/en.json`.
- Nav keys in both files must match the `key` field in `NAV_ITEMS` in `SidebarContent.tsx`.
- Use `useTranslations("nav")` / `getTranslations("nav")` — don't hardcode Greek strings in components.

### Dates
- Never use `new Date().setHours(0,0,0,0)` — it gives wrong midnight in UTC+3.
- Always use `utcMidnight(date?)` from `src/lib/dates.ts` for date-only values.
- **Display format is always DD/MM/YY** — use `fmtDisplayDate()` / `fmtDisplayDateTime()` from `src/lib/dates.ts`. When a hand-rolled `toLocaleDateString` is unavoidable (e.g. weekday labels), pass `year: "2-digit"`, never `"numeric"`. Exceptions: month-only headings ("Μάρτιος 2026") and the official A4 print documents (exit permit, substitution daily sheet, referral print), which keep DD/MM/YYYY to match the paper forms.
- **Date ENTRY: never use `<input type="date">`** — native date inputs render in the BROWSER's locale (MM/DD/YYYY on English machines). Use `<DateInput>` from `@/components/ui/date-input` instead: displays/accepts DD/MM/YY, calendar button opens the native picker, submits ISO via a hidden input (`name` prop) or reports it via `onChange(iso)`. `onCommit` for auto-submitting filters.

### Styling
- Tailwind v4 — no `tailwind.config.js`, config is in CSS.
- Brand palette: `emerald-*` (primary), `slate-*` (text/borders), `amber-*` (warnings).
- Use `cn()` from `@/lib/utils` for conditional classes.

## Testing Requirements

**Write a test for every new feature or logic change.** Tests live in `src/test/unit/`.

### What to test
- Every new pure function (RBAC helpers, date utilities, calculation logic, filter predicates).
- Business rules extracted from server actions or tRPC procedures.
- Edge cases: empty arrays, null/undefined inputs, boundary values.

### What NOT to test
- Database queries (integration tests are out of scope — the Prisma mock in `setup.ts` covers unit boundaries).
- Next.js rendering or routing.
- shadcn/UI component behaviour.

### Test style
Follow the existing pattern in `src/test/unit/`:

```ts
import { describe, it, expect } from "vitest";

describe("Feature name", () => {
  it("does X when Y", () => {
    expect(fn(input)).toBe(expected);
  });
});
```

- One `describe` block per module/feature.
- Test names use plain English: `"returns false when user lacks role"`.
- Extract inline pure logic from components/actions into a testable function, then import it.
- Run `npm run test` and confirm all tests pass before marking work complete.

## Known Gotchas

- **Turbopack cache**: after `prisma generate`, always `rm -rf .next` or you get stale client errors.
- **StaffProfile.user is optional**: bulk-replace `.user.name` → `.user?.name` if you add new nullable userId relations.
- **GroupId on Referrals**: `groupId` is always set at creation from `student.groupId` — safe to filter by it directly.
- **HEADTEACHER_B names in schedule**: their `staffName` ends in `"ΒΔ"` and maps to `sp_headteacher_b_XX` profile IDs.
- **utcMidnight**: always use this helper — raw `setHours(0,0,0,0)` silently produces wrong dates in the UTC+3 timezone.
