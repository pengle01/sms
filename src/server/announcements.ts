import { db } from "@/server/db";

// One include shape for every surface — both staff dashboards and both
// notification hubs — because the byline needs the author's role, which is
// easy to forget from a select written out by hand each time.
const include = {
  author: {
    select: { name: true, role: true, staffProfile: { select: { scheduleName: true } } },
  },
  files: true,
} as const;

/**
 * «Ανακοινώσεις ημέρας» for one day — what the dashboards show. The day lives
 * in `pinnedUntil` (the column predates one-day announcements).
 */
export function getAnnouncementsForDay(day: Date) {
  return db.announcement.findMany({
    where: { pinnedUntil: day },
    orderBy: { createdAt: "desc" },
    include,
  });
}

/** Today's and future announcements — the posters' list, so a pre-written one can be fixed. */
export function getUpcomingAnnouncements(today: Date) {
  return db.announcement.findMany({
    where: { pinnedUntil: { gte: today } },
    orderBy: [{ pinnedUntil: "asc" }, { createdAt: "desc" }],
    include,
  });
}

export type ActiveAnnouncement = Awaited<ReturnType<typeof getAnnouncementsForDay>>[number];
