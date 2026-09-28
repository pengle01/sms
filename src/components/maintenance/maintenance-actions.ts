"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { logger, errInfo } from "@/server/logger";
import { getRooms } from "@/server/rooms";
import { getPortalForRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";
import {
  canFileMaintenance,
  canViewRequest,
  isHandler,
  isStatus,
  itRecipients,
  notifiesFiler,
  validateComment,
  validateNewRequest,
  validateStatusChange,
  type Equipment,
  type MaintenanceActor,
} from "@/lib/maintenance";
import {
  allItUserIds,
  assignedRoomNames,
  getMaintenanceViewer,
  roomMaintainerUserIds,
} from "@/server/maintenance";

// Error values are keys in the "maintenance" message namespace.
export type MaintenanceActionError =
  | "errNotAllowed"
  | "errNotFound"
  | "errRoom"
  | "errEquipment"
  | "errDescription"
  | "errDescriptionLong"
  | "errComment"
  | "errCommentLong"
  | "errTransition"
  | "errNoteRequired"
  | "errConflict"
  | "errGeneric";
export type MaintenanceResult = { ok: true } | { ok: false; error: MaintenanceActionError };
export type CreateMaintenanceResult = { ok: true; id: string } | { ok: false; error: MaintenanceActionError };

async function authorize() {
  const auth = await getActiveAuth();
  if (!auth || !canFileMaintenance(auth.roles)) return null;
  return auth;
}

function revalidateMaintenance() {
  for (const portal of ["teacher", "office", "admin"]) {
    revalidatePath(`/[locale]/(portal)/${portal}/maintenance`, "page");
    revalidatePath(`/[locale]/(portal)/${portal}/maintenance/[id]`, "page");
  }
}

const NOTIFY_BODY_MAX = 200;
const clip = (s: string) => (s.length > NOTIFY_BODY_MAX ? `${s.slice(0, NOTIFY_BODY_MAX - 1)}…` : s);

/**
 * Bell notifications, each linking into the recipient's own portal (an IT
 * teacher lands in /teacher, the secretary in /office). Written in Greek, like
 * every other notification in the app — they are stored as text, not keys.
 * Best-effort: a failure here is logged and never undoes the action itself.
 */
async function notify(
  userIds: string[],
  requestId: string,
  actorId: string,
  n: { type: "MAINTENANCE_CREATED" | "MAINTENANCE_RESOLVED"; title: string; body?: string | null },
) {
  if (userIds.length === 0) return;
  try {
    const users = await db.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, role: true },
    });
    const data = users.flatMap((u) => {
      const portal = getPortalForRole(u.role);
      if (portal !== "teacher" && portal !== "office" && portal !== "admin") return [];
      return [{
        userId: u.id,
        type: n.type,
        title: n.title,
        body: n.body ? clip(n.body) : null,
        linkUrl: `/${portal}/maintenance/${requestId}`,
        senderId: actorId,
      }];
    });
    if (data.length > 0) await db.notification.createMany({ data });
  } catch (e) {
    logger.error({ event: "maintenance.notifyFailed", err: errInfo(e), requestId }, "Maintenance notification failed");
  }
}

async function greekLabels() {
  const t = await getTranslations({ locale: "el", namespace: "maintenance" });
  return {
    t,
    equipment: (e: Equipment) => t(`equipment.${e}` as Parameters<typeof t>[0]),
  };
}

async function itSideRecipients(room: string, actorId: string) {
  const [maintainers, allIt] = await Promise.all([roomMaintainerUserIds(room), allItUserIds()]);
  return itRecipients(maintainers, allIt, actorId);
}

/** File a new request. Notifies the room's IT maintainers (or all of them, if it has none). */
export async function createMaintenanceRequest(input: {
  room: string;
  equipment: string;
  description: string;
}): Promise<CreateMaintenanceResult> {
  const auth = await authorize();
  if (!auth) return { ok: false, error: "errNotAllowed" };

  const rooms = await getRooms();
  const checked = validateNewRequest(input, new Set(rooms.map((r) => r.name)));
  if (!checked.ok) return { ok: false, error: checked.error };
  const { room, equipment, description } = checked.value;

  const request = await db.$transaction(async (tx) => {
    const r = await tx.maintenanceRequest.create({
      data: { room, equipment, description, createdById: auth.userId },
    });
    await tx.maintenanceEvent.create({
      data: { requestId: r.id, authorId: auth.userId, kind: "CREATED", toStatus: "OPEN" },
    });
    return r;
  });

  await writeAudit({
    userId: auth.userId,
    action: "maintenance.create",
    resource: "MaintenanceRequest",
    resourceId: request.id,
    details: { room, equipment },
    ...(await requestMeta()),
  });

  const el = await greekLabels();
  await notify(await itSideRecipients(room, auth.userId), request.id, auth.userId, {
    type: "MAINTENANCE_CREATED",
    title: el.t("notifyCreated", { room, equipment: el.equipment(equipment) }),
    body: description,
  });

  revalidateMaintenance();
  return { ok: true, id: request.id };
}

async function loadForAction(requestId: string, auth: { userId: string; roles: Role[] }) {
  const [viewer, assigned, request] = await Promise.all([
    getMaintenanceViewer(auth),
    assignedRoomNames(),
    db.maintenanceRequest.findUnique({
      where: { id: requestId },
      select: { id: true, room: true, status: true, createdById: true },
    }),
  ]);
  if (!request || !canViewRequest(viewer, request, assigned)) return null;
  return { viewer, assigned, request };
}

/** Add a comment to the timeline. Filer and IT alike may comment; nobody is notified. */
export async function addMaintenanceComment(requestId: string, body: string): Promise<MaintenanceResult> {
  const auth = await authorize();
  if (!auth) return { ok: false, error: "errNotAllowed" };
  // Still loaded for the visibility check: only the filer and the handlers may comment.
  if (!(await loadForAction(requestId, auth))) return { ok: false, error: "errNotFound" };

  const error = validateComment(body);
  if (error) return { ok: false, error };
  const text = body.trim();

  await db.$transaction([
    db.maintenanceEvent.create({
      data: { requestId, authorId: auth.userId, kind: "COMMENT", body: text },
    }),
    db.maintenanceRequest.update({ where: { id: requestId }, data: { updatedAt: new Date() } }),
  ]);

  await writeAudit({
    userId: auth.userId,
    action: "maintenance.comment",
    resource: "MaintenanceRequest",
    resourceId: requestId,
    ...(await requestMeta()),
  });

  // Comments stay on the timeline without alerting anyone: notifications are
  // for a new request and its resolution only (see notifiesFiler).
  revalidateMaintenance();
  return { ok: true };
}

/**
 * Move a request to another status, with a note (required to resolve or
 * reopen). The change only applies if the request is still in the status the
 * person saw, so two people acting at once cannot overwrite each other.
 */
export async function changeMaintenanceStatus(
  requestId: string,
  to: string,
  note: string,
): Promise<MaintenanceResult> {
  const auth = await authorize();
  if (!auth) return { ok: false, error: "errNotAllowed" };
  const loaded = await loadForAction(requestId, auth);
  if (!loaded) return { ok: false, error: "errNotFound" };
  const { viewer, assigned, request } = loaded;
  if (!isStatus(to)) return { ok: false, error: "errTransition" };

  const actors: MaintenanceActor[] = [];
  if (request.createdById === auth.userId) actors.push("filer");
  if (isHandler(viewer, request.room, assigned)) actors.push("handler");

  const error = validateStatusChange(actors, request.status, to, note);
  if (error) return { ok: false, error };
  const text = note.trim() || null;
  const from = request.status;

  const applied = await db.$transaction(async (tx) => {
    const updated = await tx.maintenanceRequest.updateMany({
      where: { id: requestId, status: from },
      data: { status: to, resolvedAt: to === "RESOLVED" ? new Date() : null },
    });
    if (updated.count === 0) return false;
    await tx.maintenanceEvent.create({
      data: { requestId, authorId: auth.userId, kind: "STATUS_CHANGE", fromStatus: from, toStatus: to, body: text },
    });
    return true;
  });
  if (!applied) return { ok: false, error: "errConflict" };

  await writeAudit({
    userId: auth.userId,
    action: "maintenance.status",
    resource: "MaintenanceRequest",
    resourceId: requestId,
    details: { from, to },
    ...(await requestMeta()),
  });

  // Only a resolution notifies anyone — the filer, unless they resolved it
  // themselves (an IT maintainer fixing a fault they reported).
  if (notifiesFiler(to) && request.createdById && request.createdById !== auth.userId) {
    const el = await greekLabels();
    await notify([request.createdById], requestId, auth.userId, {
      type: "MAINTENANCE_RESOLVED",
      title: el.t("notifyResolved", { room: request.room }),
      body: text,
    });
  }

  revalidateMaintenance();
  return { ok: true };
}
