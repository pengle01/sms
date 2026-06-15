// Group sent staff notifications into message "batches": one compose action
// fans out to many recipient rows, so we collapse rows that share a title+body
// back into a single sent item, tracking how many recipients have seen it.
// Pure (no DB/React) so it can be unit-tested.

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
