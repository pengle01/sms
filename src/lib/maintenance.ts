// IT maintenance requests — the access and workflow rules. Pure, unit-tested,
// no DB: every server action and page decides through these functions.
import type { Role } from "@/generated/prisma/client";
import { isEducator, isOfficeAdmin, isAdminStaff } from "@/lib/rbac";
import { matchesSearch } from "@/lib/textSearch";

export const EQUIPMENT = [
  "LAPTOP",
  "COMPUTER",
  "PROJECTOR",
  "TV",
  "INTERACTIVE_BOARD",
  "NETWORK",
  "OTHER",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type Status = (typeof STATUSES)[number];

export const DESCRIPTION_MAX = 2000;
export const COMMENT_MAX = 2000;

export function isEquipment(v: unknown): v is Equipment {
  return typeof v === "string" && (EQUIPMENT as readonly string[]).includes(v);
}

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/**
 * Who may file and follow requests: every staff portal — educators, the office
 * and the system admin. Students, parents and chaperones may not.
 */
export function canFileMaintenance(roles: Role[]): boolean {
  return roles.some((r) => isEducator(r) || isOfficeAdmin(r) || isAdminStaff(r));
}

/** What the current user is, as far as maintenance is concerned. */
export interface MaintenanceViewer {
  userId: string;
  /** SUPER_ADMIN (primary or granted): sees and handles everything. */
  isAdmin: boolean;
  /** Holds the IT-maintenance designation. */
  isIt: boolean;
  /** Names of the rooms assigned to this IT maintainer. */
  myRooms: ReadonlySet<string>;
}

/**
 * May this viewer handle (and therefore see) requests for this room?
 *
 * The admin always. An IT maintainer for their own rooms — and for any room
 * nobody maintains, so a request is never stranded while assignments are
 * incomplete. `assignedRooms` is the set of rooms that have an active maintainer.
 */
export function isHandler(
  viewer: MaintenanceViewer,
  room: string,
  assignedRooms: ReadonlySet<string>,
): boolean {
  if (viewer.isAdmin) return true;
  if (!viewer.isIt) return false;
  return viewer.myRooms.has(room) || !assignedRooms.has(room);
}

/** The filer sees their own request; handlers see the requests for their rooms. */
export function canViewRequest(
  viewer: MaintenanceViewer,
  request: { room: string; createdById: string | null },
  assignedRooms: ReadonlySet<string>,
): boolean {
  return request.createdById === viewer.userId || isHandler(viewer, request.room, assignedRooms);
}

/** The capacities in which someone acts on a request — an IT teacher may be both. */
export type MaintenanceActor = "handler" | "filer";

const TRANSITIONS: Record<MaintenanceActor, Record<Status, Status[]>> = {
  handler: {
    OPEN: ["IN_PROGRESS", "RESOLVED"],
    IN_PROGRESS: ["OPEN", "RESOLVED"],
    RESOLVED: ["OPEN"],
  },
  // The filer's only move: reopen a request that was marked resolved but isn't.
  filer: {
    OPEN: [],
    IN_PROGRESS: [],
    RESOLVED: ["OPEN"],
  },
};

/** Statuses this person may move the request to, in display order. */
export function allowedTransitions(actors: readonly MaintenanceActor[], from: Status): Status[] {
  const allowed = new Set(actors.flatMap((a) => TRANSITIONS[a][from]));
  return STATUSES.filter((s) => allowed.has(s));
}

/**
 * Resolving must say what was done, and reopening must say what is still
 * wrong — otherwise the timeline records a change without its reason.
 */
export function noteRequired(from: Status, to: Status): boolean {
  return to === "RESOLVED" || (from === "RESOLVED" && to === "OPEN");
}

export type NewRequestError = "errRoom" | "errEquipment" | "errDescription" | "errDescriptionLong";

export function validateNewRequest(
  input: { room: string; equipment: string; description: string },
  knownRooms: ReadonlySet<string>,
):
  | { ok: true; value: { room: string; equipment: Equipment; description: string } }
  | { ok: false; error: NewRequestError } {
  const room = input.room.trim();
  const description = input.description.trim();
  if (!knownRooms.has(room)) return { ok: false, error: "errRoom" };
  if (!isEquipment(input.equipment)) return { ok: false, error: "errEquipment" };
  if (!description) return { ok: false, error: "errDescription" };
  if (description.length > DESCRIPTION_MAX) return { ok: false, error: "errDescriptionLong" };
  return { ok: true, value: { room, equipment: input.equipment, description } };
}

export type CommentError = "errComment" | "errCommentLong";

export function validateComment(body: string): CommentError | null {
  const trimmed = body.trim();
  if (!trimmed) return "errComment";
  if (trimmed.length > COMMENT_MAX) return "errCommentLong";
  return null;
}

export type StatusChangeError = "errTransition" | "errNoteRequired" | "errCommentLong";

export function validateStatusChange(
  actors: readonly MaintenanceActor[],
  from: Status,
  to: Status,
  note: string,
): StatusChangeError | null {
  if (!allowedTransitions(actors, from).includes(to)) return "errTransition";
  const trimmed = note.trim();
  if (noteRequired(from, to) && !trimmed) return "errNoteRequired";
  if (trimmed.length > COMMENT_MAX) return "errCommentLong";
  return null;
}

/**
 * Notifications are sent for exactly two events: a new request (to IT, see
 * itRecipients) and its resolution (to the filer). Starting work, comments and
 * reopening stay on the timeline without alerting anyone — the user's choice,
 * matching how referrals notify on filing and on resolution only.
 */
export function notifiesFiler(to: Status): boolean {
  return to === "RESOLVED";
}

/**
 * Who hears about activity on the IT side: the room's maintainers, or every IT
 * maintainer when the room has none. Never the person who acted.
 */
export function itRecipients(
  roomMaintainerUserIds: readonly string[],
  allItUserIds: readonly string[],
  actorId: string,
): string[] {
  const pool = roomMaintainerUserIds.length > 0 ? roomMaintainerUserIds : allItUserIds;
  return [...new Set(pool)].filter((id) => id !== actorId);
}

// ─── The list page ───────────────────────────────────────────────────────────

export type MaintenanceTab = "mine" | "rooms" | "all";

/** Tabs this viewer may open, in display order. */
export function availableTabs(viewer: Pick<MaintenanceViewer, "isAdmin" | "isIt">): MaintenanceTab[] {
  const tabs: MaintenanceTab[] = ["mine"];
  if (viewer.isIt) tabs.push("rooms");
  if (viewer.isAdmin) tabs.push("all");
  return tabs;
}

/**
 * The requested tab if allowed, otherwise the most useful default: the IT
 * inbox for a maintainer, everything for the admin, "mine" for everyone else.
 */
export function resolveTab(
  requested: string | undefined,
  viewer: Pick<MaintenanceViewer, "isAdmin" | "isIt">,
): MaintenanceTab {
  const tabs = availableTabs(viewer);
  if (requested && (tabs as string[]).includes(requested)) return requested as MaintenanceTab;
  if (viewer.isIt) return "rooms";
  if (viewer.isAdmin) return "all";
  return "mine";
}

export interface MaintenanceRow {
  id: string;
  room: string;
  equipment: Equipment;
  status: Status;
  description: string;
  createdByName: string | null;
  createdAt: Date;
}

export interface MaintenanceFilter {
  status?: string;
  equipment?: string;
  q?: string;
}

/**
 * Narrow the list in memory: status, equipment, and free text over the room,
 * the description and the filer. Accent-insensitive, like every search here —
 * Postgres `mode: "insensitive"` folds case but not Greek accents.
 */
export function filterRequests<T extends MaintenanceRow>(rows: T[], f: MaintenanceFilter): T[] {
  const q = (f.q ?? "").trim();
  return rows.filter((r) => {
    if (isStatus(f.status) && r.status !== f.status) return false;
    if (isEquipment(f.equipment) && r.equipment !== f.equipment) return false;
    if (q && !matchesSearch(r.room, q) && !matchesSearch(r.description, q) && !matchesSearch(r.createdByName, q)) {
      return false;
    }
    return true;
  });
}

/** Open first, then in progress, then resolved; newest first within each. */
export function sortRequests<T extends MaintenanceRow>(rows: T[]): T[] {
  const rank = (s: Status) => STATUSES.indexOf(s);
  return [...rows].sort(
    (a, b) => rank(a.status) - rank(b.status) || b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

/** How many are not yet resolved — the badge on a tab. */
export function unresolvedCount(rows: readonly { status: Status }[]): number {
  return rows.filter((r) => r.status !== "RESOLVED").length;
}

/** URL keys the list page owns — shared by the pills and the row links. */
export const MAINTENANCE_KEYS = ["tab", "status", "equipment", "q"] as const;
