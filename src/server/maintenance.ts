import { db } from "@/server/db";
import type { Prisma, Role } from "@/generated/prisma/client";
import { isAdminStaff } from "@/lib/rbac";
import {
  canViewRequest,
  seesAll,
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
      itManager: true,
      roomsMaintained: { select: { room: { select: { name: true } } } },
    },
  });
  const isIt = !!staff?.itMaintenance;
  const isManager = !!staff?.itManager;
  return {
    userId: auth.userId,
    isAdmin: auth.roles.some(isAdminStaff),
    isManager,
    isIt,
    myRooms: new Set(isIt || isManager ? staff!.roomsMaintained.map((m) => m.room.name) : []),
  };
}

/** An active room maintainer: an IT maintainer, or an IT manager given rooms. */
const MAINTAINS = { OR: [{ itMaintenance: true }, { itManager: true }] };

/**
 * Rooms that have an active maintainer. A maintainer whose designation was
 * removed no longer counts, so their rooms fall back to "unassigned" — visible
 * to every IT maintainer — instead of to nobody.
 */
export async function assignedRoomNames(): Promise<Set<string>> {
  const rows = await db.roomMaintainer.findMany({
    where: { staffProfile: MAINTAINS },
    select: { room: { select: { name: true } } },
  });
  return new Set(rows.map((r) => r.room.name));
}

/**
 * Each maintained room with the names of its maintainers — what the person
 * filing a request is shown. Same rule as assignedRoomNames: a room missing
 * here has no maintainer, so every IT maintainer sees its requests.
 */
export async function roomMaintainerNames(): Promise<Record<string, string[]>> {
  const rows = await db.roomMaintainer.findMany({
    where: { staffProfile: MAINTAINS },
    select: {
      room: { select: { name: true } },
      staffProfile: { select: { scheduleName: true, user: { select: { name: true } } } },
    },
  });
  const byRoom: Record<string, string[]> = {};
  for (const r of rows) {
    const name = personName({
      name: r.staffProfile.user?.name ?? null,
      staffProfile: { scheduleName: r.staffProfile.scheduleName },
    });
    if (name) (byRoom[r.room.name] ??= []).push(name);
  }
  for (const names of Object.values(byRoom)) names.sort((a, b) => a.localeCompare(b, "el"));
  return byRoom;
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
  if (tab === "all" && seesAll(viewer)) {
    where = {};
  } else if (tab === "rooms" && (viewer.isIt || viewer.isManager)) {
    where = { room: { in: [...viewer.myRooms] } };
  } else if (tab === "unassigned" && (viewer.isIt || viewer.isManager)) {
    where = { room: { notIn: [...assigned] } };
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
      staffProfile: { ...MAINTAINS, userId: { not: null }, user: { isActive: true } },
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

/** User ids of every active IT manager — told about every new request. */
export async function itManagerUserIds(): Promise<string[]> {
  const rows = await db.staffProfile.findMany({
    where: { itManager: true, userId: { not: null }, user: { isActive: true } },
    select: { userId: true },
  });
  return rows.flatMap((r) => (r.userId ? [r.userId] : []));
}
