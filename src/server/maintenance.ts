import { db } from "@/server/db";
import type { Prisma, Role } from "@/generated/prisma/client";
import { isAdminStaff } from "@/lib/rbac";
import {
  canViewRequest,
  type MaintenanceViewer,
  type MaintenanceTab,
  type MaintenanceRow,
} from "@/lib/maintenance";

/**
 * Who the current user is for maintenance purposes. The designation and the
 * room list are read fresh on every request, like the other designations — a
 * change by the admin takes effect on the next page load.
 */
export async function getMaintenanceViewer(auth: {
  userId: string;
  roles: Role[];
}): Promise<MaintenanceViewer> {
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      itMaintenance: true,
      roomsMaintained: { select: { room: { select: { name: true } } } },
    },
  });
  const isIt = !!staff?.itMaintenance;
  return {
    userId: auth.userId,
    isAdmin: auth.roles.some(isAdminStaff),
    isIt,
    myRooms: new Set(isIt ? staff!.roomsMaintained.map((m) => m.room.name) : []),
  };
}

/**
 * Rooms that have an active maintainer. A maintainer whose designation was
 * removed no longer counts, so their rooms fall back to "unassigned" — visible
 * to every IT maintainer — instead of to nobody.
 */
export async function assignedRoomNames(): Promise<Set<string>> {
  const rows = await db.roomMaintainer.findMany({
    where: { staffProfile: { itMaintenance: true } },
    select: { room: { select: { name: true } } },
  });
  return new Set(rows.map((r) => r.room.name));
}

const PERSON = {
  select: { name: true, staffProfile: { select: { scheduleName: true } } },
} as const;

/** Timetable coding for staff ("ΗΥ-ΜΑΣΙΑ Μ."), the account name otherwise (the office). */
export function personName(
  u: { name: string | null; staffProfile: { scheduleName: string | null } | null } | null,
): string | null {
  return u?.staffProfile?.scheduleName ?? u?.name ?? null;
}

/** The rows for one tab of the list page — already restricted to what the viewer may see. */
export async function listRequests(
  viewer: MaintenanceViewer,
  tab: MaintenanceTab,
  assigned: ReadonlySet<string>,
): Promise<MaintenanceRow[]> {
  let where: Prisma.MaintenanceRequestWhereInput;
  if (tab === "all" && viewer.isAdmin) {
    where = {};
  } else if (tab === "rooms" && viewer.isIt) {
    where = { OR: [{ room: { in: [...viewer.myRooms] } }, { room: { notIn: [...assigned] } }] };
  } else {
    where = { createdById: viewer.userId };
  }
  const rows = await db.maintenanceRequest.findMany({
    where,
    select: {
      id: true,
      room: true,
      equipment: true,
      status: true,
      description: true,
      createdAt: true,
      createdBy: PERSON,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    room: r.room,
    equipment: r.equipment,
    status: r.status,
    description: r.description,
    createdAt: r.createdAt,
    createdByName: personName(r.createdBy),
  }));
}

/** One request with its timeline, or null when it doesn't exist or the viewer may not see it. */
export async function loadRequest(id: string, viewer: MaintenanceViewer, assigned: ReadonlySet<string>) {
  const request = await db.maintenanceRequest.findUnique({
    where: { id },
    include: {
      createdBy: PERSON,
      events: {
        orderBy: { createdAt: "asc" },
        include: { author: PERSON },
      },
    },
  });
  if (!request || !canViewRequest(viewer, request, assigned)) return null;
  return request;
}

/** User ids of the active IT maintainers of one room. */
export async function roomMaintainerUserIds(room: string): Promise<string[]> {
  const rows = await db.roomMaintainer.findMany({
    where: {
      room: { name: room },
      staffProfile: { itMaintenance: true, userId: { not: null }, user: { isActive: true } },
    },
    select: { staffProfile: { select: { userId: true } } },
  });
  return rows.flatMap((r) => (r.staffProfile.userId ? [r.staffProfile.userId] : []));
}

/** User ids of every active IT maintainer. */
export async function allItUserIds(): Promise<string[]> {
  const rows = await db.staffProfile.findMany({
    where: { itMaintenance: true, userId: { not: null }, user: { isActive: true } },
    select: { userId: true },
  });
  return rows.flatMap((r) => (r.userId ? [r.userId] : []));
}
