import { db } from "@/server/db";
import { writeAudit, requestMeta } from "@/server/audit";
import {
  HANDOVER_DESIGNATIONS,
  mayDeactivateLogin,
  testOwnerAfter,
  type HandoverDesignation,
  type HandoverEntry,
} from "@/lib/teacherHandover";

/**
 * Apply the admin's choices after a timetable import, one teacher per
 * transaction. Run after the lessons are final: tests go to whoever teaches that
 * class and course now. Old conversations go read-only (parentMessaging off);
 * attendance, referrals and every other record keep who really did them.
 */
export async function applyTeacherHandovers(
  entries: readonly HandoverEntry[],
  actorUserId: string,
): Promise<{ applied: number; testsMoved: number; errors: string[] }> {
  if (entries.length === 0) return { applied: 0, testsMoved: 0, errors: [] };

  const [profiles, slots] = await Promise.all([
    db.staffProfile.findMany({
      where: { scheduleName: { not: null } },
      select: {
        id: true,
        scheduleName: true,
        userId: true,
        user: { select: { role: true, extraRoles: true } },
      },
    }),
    db.timetableSlot.findMany({ select: { groupId: true, courseId: true, staffName: true } }),
  ]);
  const byName = new Map(profiles.map((p) => [p.scheduleName!.trim(), p]));
  const teachersOf = new Map<string, string[]>();
  for (const s of slots) {
    const name = s.staffName?.trim();
    if (!name) continue;
    const key = `${s.groupId}|${s.courseId}`;
    teachersOf.set(key, [...(teachersOf.get(key) ?? []), name]);
  }

  const meta = await requestMeta();
  let applied = 0;
  let testsMoved = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const old = byName.get(entry.left);
    if (!old) {
      errors.push(`${entry.left}: no staff record`);
      continue;
    }
    const next = entry.replacement ? byName.get(entry.replacement) : undefined;
    try {
      const summary = await db.$transaction(async (tx) => {
        const tests = await tx.testSchedule.findMany({
          where: { staffId: old.id },
          select: { id: true, groupId: true, courseId: true },
        });
        const idsByOwner = new Map<string, string[]>();
        for (const t of tests) {
          const owner = testOwnerAfter(teachersOf.get(`${t.groupId}|${t.courseId}`) ?? [], entry.replacement);
          const ownerId = owner ? byName.get(owner)?.id : undefined;
          if (ownerId && ownerId !== old.id) idsByOwner.set(ownerId, [...(idsByOwner.get(ownerId) ?? []), t.id]);
        }
        let moved = 0;
        for (const [staffId, ids] of idsByOwner) {
          moved += (await tx.testSchedule.updateMany({ where: { id: { in: ids } }, data: { staffId } })).count;
        }

        let homegroups = 0;
        let dutyPosts = 0;
        let rooms = 0;
        if (next) {
          for (const field of ["homeroomTeacherId", "homeroomHeadteacherId", "counselorId"] as const) {
            homegroups += (await tx.group.updateMany({ where: { [field]: old.id }, data: { [field]: next.id } })).count;
          }
          dutyPosts = (
            await tx.dutyPostAssignment.updateMany({
              where: { OR: [{ staffProfileId: old.id }, { teacherName: entry.left }] },
              data: { staffProfileId: next.id, teacherName: entry.replacement! },
            })
          ).count;
          const held = await tx.roomMaintainer.findMany({ where: { staffProfileId: old.id }, select: { roomId: true } });
          if (held.length > 0) {
            await tx.roomMaintainer.createMany({
              data: held.map((r) => ({ roomId: r.roomId, staffProfileId: next.id })),
              skipDuplicates: true,
            });
            await tx.roomMaintainer.deleteMany({ where: { staffProfileId: old.id } });
            rooms = held.length;
          }
        }

        const moving: HandoverDesignation[] = next
          ? HANDOVER_DESIGNATIONS.filter((d) => entry.designations.includes(d))
          : [];
        if (moving.length > 0) {
          await tx.staffProfile.update({
            where: { id: next!.id },
            data: Object.fromEntries(moving.map((d) => [d, true])),
          });
        }
        await tx.staffProfile.update({
          where: { id: old.id },
          data: { ...Object.fromEntries(moving.map((d) => [d, false])), parentMessaging: false },
        });

        const deactivated =
          entry.deactivateLogin &&
          !!old.userId &&
          !!old.user &&
          mayDeactivateLogin({
            targetUserId: old.userId,
            actorUserId,
            targetRole: old.user.role,
            targetExtraRoles: old.user.extraRoles,
          });
        if (deactivated) await tx.user.update({ where: { id: old.userId! }, data: { isActive: false } });

        return { moved, homegroups, dutyPosts, rooms, moving, deactivated };
      });

      applied++;
      testsMoved += summary.moved;
      await writeAudit({
        userId: actorUserId,
        action: "staff.handover",
        resource: "StaffProfile",
        resourceId: old.id,
        details: {
          left: entry.left,
          replacement: entry.replacement,
          tests: summary.moved,
          homegroups: summary.homegroups,
          dutyPosts: summary.dutyPosts,
          rooms: summary.rooms,
          designations: summary.moving,
          loginDeactivated: summary.deactivated,
        },
        ...meta,
      });
    } catch (err) {
      errors.push(`${entry.left}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { applied, testsMoved, errors };
}
