// Group sent staff notifications into message "batches": one compose action
// fans out to many recipient rows, so we collapse rows that share a title+body
// back into a single sent item, tracking how many recipients have seen it.
// Pure (no DB/React) so it can be unit-tested.

import type { Role } from "@/generated/prisma/client";
import { isManagement, isOfficeAdmin } from "@/lib/rbac";

/**
 * Who may send an ad-hoc notification to the teaching staff: management, the
 * counselor, and the school office. Not a plain teacher — this fans out to
 * every educator's inbox.
 *
 * SUPER_ADMIN is deliberately absent, matching how the app treats it elsewhere:
 * a system administrator is not school staff, and an admin grant is added on top
 * of a real role that already qualifies.
 */
export function canSendStaffNotifications(roles: Role[]): boolean {
  return roles.some((r) => isManagement(r) || isOfficeAdmin(r) || r === "STUDENT_COUNSELOR");
}

export interface SentNotificationRow {
  title: string;
  body: string | null;
  createdAt: Date;
  read: boolean;
  noticedAt: Date | null;
}

export interface SentBatch {
  title: string;
  sentAt: Date;
  total: number;
  seen: number;
}

export function groupSentNotifications(rows: SentNotificationRow[]): SentBatch[] {
  const batches = new Map<string, SentBatch>();
  for (const r of rows) {
    const key = `${r.title} ${r.body ?? ""}`;
    const b = batches.get(key) ?? { title: r.title, sentAt: r.createdAt, total: 0, seen: 0 };
    b.total += 1;
    if (r.read || r.noticedAt) b.seen += 1;
    if (r.createdAt > b.sentAt) b.sentAt = r.createdAt;
    batches.set(key, b);
  }
  return [...batches.values()].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
}

/** Compose errors the page may report, as an allowlist. */
const COMPOSE_ERRORS = ["title", "body", "recipients", "attachment"] as const;
export type ComposeError = (typeof COMPOSE_ERRORS)[number];

/**
 * Normalise an untrusted `?error=` value. The banner resolves it with a dynamic
 * `t(`err_${...}`)` lookup, so an unknown value throws rather than showing
 * nothing — which is how a rejected attachment currently blows up, since
 * `err_attachment` was never added to the message files.
 */
export function composeErrorKey(raw: string | null | undefined): ComposeError | null {
  return (COMPOSE_ERRORS as readonly string[]).includes(raw ?? "")
    ? (raw as ComposeError)
    : null;
}
