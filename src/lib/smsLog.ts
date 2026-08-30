// Pure helpers for the sent-SMS log — kept free of Prisma imports so they are
// unit-testable; they return plain `where` fragments.
//
// The log is a verification tool and nothing else: it answers "was this text
// actually sent, to whom, by whom, and when". There is no resend, no edit and
// no delete, so nothing here builds a mutation.

export const SMS_STATUSES = ["SENT", "FAILED"] as const;
export type SmsLogStatus = (typeof SMS_STATUSES)[number];

export const SMS_KINDS = ["BROADCAST", "ABSENCE", "REFERRAL"] as const;
export type SmsLogKind = (typeof SMS_KINDS)[number];

/** URL keys the log owns — shared by the filter form and the pager links. */
export const SMS_LOG_KEYS = ["from", "to", "status", "kind", "q", "page"] as const;

export const SMS_LOG_PAGE_SIZE = 50;

export function parseSmsStatus(v: string | undefined | null): SmsLogStatus | null {
  return (SMS_STATUSES as readonly string[]).includes(v ?? "") ? (v as SmsLogStatus) : null;
}

export function parseSmsKind(v: string | undefined | null): SmsLogKind | null {
  return (SMS_KINDS as readonly string[]).includes(v ?? "") ? (v as SmsLogKind) : null;
}

/** 1-based, never below 1 — a hand-edited `?page=0` must not produce a negative skip. */
export function parseSmsLogPage(v: string | undefined | null): number {
  const n = parseInt(v ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function smsLogPageCount(total: number, size = SMS_LOG_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export interface SmsLogFilter {
  /** Inclusive date-only bounds, already resolved to UTC midnights by the caller. */
  from?: Date | null;
  to?: Date | null;
  status?: SmsLogStatus | null;
  kind?: SmsLogKind | null;
  /** Free text over the recipient's number and the student's name. */
  q?: string;
}

/**
 * The log's `where`.
 *
 * `to` is treated as an inclusive day: the caller passes that day's midnight and
 * we compare against the *next* midnight with `lt`, so a message sent at 14:20
 * on the end date is still in range. Doing it with `lte` on midnight would
 * silently drop everything after 00:00 on the last day of every range.
 */
export function smsLogWhere(f: SmsLogFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  const sentAt: Record<string, unknown> = {};
  if (f.from) sentAt.gte = f.from;
  if (f.to) sentAt.lt = new Date(f.to.getTime() + 24 * 60 * 60 * 1000);
  if (Object.keys(sentAt).length > 0) where.sentAt = sentAt;

  if (f.status) where.status = f.status;
  if (f.kind) where.kind = f.kind;

  const q = (f.q ?? "").trim();
  if (q) {
    where.OR = [
      { phoneNumber: { contains: q } },
      { student: { user: { name: { contains: q, mode: "insensitive" } } } },
      { student: { studentId: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

/**
 * How to name the person on a log row.
 *
 * An ABSENCE text is fired by the system when a teacher saves a first-period
 * register — the teacher never chose to text that parent — so the row credits
 * them as the trigger rather than the author. A row with no sender predates the
 * column and can only be reported as unknown; inventing an author for it would
 * be worse than admitting the gap.
 */
export function smsSenderLabel(
  row: { kind: string | null; sentByName: string | null },
  labels: { automatic: (name: string) => string; unknown: string },
): string {
  if (!row.sentByName) return labels.unknown;
  return row.kind === "ABSENCE" ? labels.automatic(row.sentByName) : row.sentByName;
}
