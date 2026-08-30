import { db } from "@/server/db";

/**
 * Announcements still worth showing: pinned to a date at or after `today`.
 *
 * One place, because four surfaces render the same rows with the same include
 * shape — both staff dashboards and both notification hubs — and the byline
 * needs the author's role, which is easy to forget from a select written out
 * by hand each time.
 */
export function getActiveAnnouncements(today: Date) {
  return db.announcement.findMany({
    where: { pinnedUntil: { gte: today } },
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { name: true, role: true, staffProfile: { select: { scheduleName: true } } },
      },
      files: true,
    },
  });
}

export type ActiveAnnouncement = Awaited<ReturnType<typeof getActiveAnnouncements>>[number];
