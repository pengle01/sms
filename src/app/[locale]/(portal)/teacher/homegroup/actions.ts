"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { behaviorWindowSince, groupsForStaff, loadGroupBehavior, parseBehaviorWindow } from "@/server/behaviorReport";
import { canResolveWatchlist, flagSnapshot } from "@/lib/watchlistResolve";

/**
 * The homegroup's deputy, and a student of that homegroup — or null. The
 * patterns are recomputed here, never taken from the browser.
 */
async function deputyFor(groupId: string, studentId: string) {
  const auth = await getActiveAuth();
  if (!auth) return null;
  const group = (await groupsForStaff(auth.userId)).find((g) => g.id === groupId);
  if (!group || !canResolveWatchlist(group.roles)) return null;
  const student = await db.studentProfile.findFirst({ where: { id: studentId, groupId }, select: { id: true } });
  return student ? auth : null;
}

/** «Επιλύθηκε»: take the student off «Προς διερεύνηση» until something new happens. */
export async function resolveWatchlistStudent(locale: string, groupId: string, studentId: string, window: string) {
  const auth = await deputyFor(groupId, studentId);
  if (!auth) return;
  const windowKey = parseBehaviorWindow(window);
  // A resolution is made over a running window, not one past week.
  if (windowKey === "week") return;
  const { students } = await loadGroupBehavior(groupId, await behaviorWindowSince(windowKey));
  const row = students.find((s) => s.studentProfileId === studentId);
  if (!row || row.flags.length === 0) return;
  const flags = flagSnapshot(row.flags);
  await db.watchlistResolution.upsert({
    where: { studentId },
    create: { studentId, flags, resolvedById: auth.userId },
    update: { flags, resolvedById: auth.userId, resolvedAt: new Date() },
  });
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "watchlist.resolve",
    resource: "StudentProfile",
    resourceId: studentId,
    details: { groupId, flags },
  });
  revalidatePath(`/${locale}/teacher/homegroup`);
}

/** Undo: the student is back on «Προς διερεύνηση». */
export async function reopenWatchlistStudent(locale: string, groupId: string, studentId: string) {
  const auth = await deputyFor(groupId, studentId);
  if (!auth) return;
  const gone = await db.watchlistResolution.deleteMany({ where: { studentId } });
  if (gone.count === 0) return;
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "watchlist.reopen",
    resource: "StudentProfile",
    resourceId: studentId,
    details: { groupId },
  });
  revalidatePath(`/${locale}/teacher/homegroup`);
}
