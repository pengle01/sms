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
/** The most time one resolution may record: 100 hours. */
export const MINUTES_MAX = 6000;

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
  /** Holds the IT-manager designation: sees and handles everything, like the admin. */
  isManager: boolean;
  /** Holds the IT-maintenance designation. */
  isIt: boolean;
  /** Names of the rooms assigned to this IT maintainer. */
  myRooms: ReadonlySet<string>;
}

/** The admin and the IT manager see — and handle — every request. */
export function seesAll(viewer: Pick<MaintenanceViewer, "isAdmin" | "isManager">): boolean {
  return viewer.isAdmin || viewer.isManager;
}

/**
 * May this viewer handle (and therefore see) requests for this room?
 *
 * The admin and the IT manager always. An IT maintainer for their own rooms — and for any room
 * nobody maintains, so a request is never stranded while assignments are
 * incomplete. `assignedRooms` is the set of rooms that have an active maintainer.
 */
export function isHandler(
  viewer: MaintenanceViewer,
  room: string,
  assignedRooms: ReadonlySet<string>,
): boolean {
  if (seesAll(viewer)) return true;
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

export type StatusChangeError = "errTransition" | "errNoteRequired" | "errCommentLong" | "errTimeRequired";

/** Resolving records the time spent on the job — the IT statistics come from it. */
export function timeRequired(to: Status): boolean {
  return to === "RESOLVED";
}

/** A whole number of minutes, 1 … MINUTES_MAX; anything else is "not given". */
export function isValidMinutes(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MINUTES_MAX;
}

/** Hours and minutes as typed ("1", "30"; either may be blank) → minutes, or null. */
export function minutesFrom(hours: string, minutes: string): number | null {
  const h = hours.trim() === "" ? 0 : Number(hours);
  const m = minutes.trim() === "" ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return null;
  const total = h * 60 + m;
  return isValidMinutes(total) ? total : null;
}

export function validateStatusChange(
  actors: readonly MaintenanceActor[],
  from: Status,
  to: Status,
  note: string,
  minutes: number | null = null,
): StatusChangeError | null {
  if (!allowedTransitions(actors, from).includes(to)) return "errTransition";
  const trimmed = note.trim();
  if (noteRequired(from, to) && !trimmed) return "errNoteRequired";
  if (trimmed.length > COMMENT_MAX) return "errCommentLong";
  if (timeRequired(to) && !isValidMinutes(minutes)) return "errTimeRequired";
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
 * maintainer when the room has none — and the IT managers always. Never the
 * person who acted.
 */
export function itRecipients(
  roomMaintainerUserIds: readonly string[],
  allItUserIds: readonly string[],
  managerUserIds: readonly string[],
  actorId: string,
): string[] {
  const pool = roomMaintainerUserIds.length > 0 ? roomMaintainerUserIds : allItUserIds;
  return [...new Set([...pool, ...managerUserIds])].filter((id) => id !== actorId);
}

// ─── The list page ───────────────────────────────────────────────────────────

/** "rooms": the IT maintainer's own rooms; "unassigned": rooms nobody maintains. */
export type MaintenanceTab = "mine" | "rooms" | "unassigned" | "all";

/** Tabs this viewer may open, in display order. */
export function availableTabs(viewer: Pick<MaintenanceViewer, "isAdmin" | "isManager" | "isIt">): MaintenanceTab[] {
  const tabs: MaintenanceTab[] = ["mine"];
  if (viewer.isIt || viewer.isManager) tabs.push("rooms", "unassigned");
  if (seesAll(viewer)) tabs.push("all");
  return tabs;
}

/**
 * The requested tab if allowed, otherwise the most useful default: the IT
 * inbox for a maintainer, everything for the admin and the IT manager, "mine"
 * for everyone else.
 */
export function resolveTab(
  requested: string | undefined,
  viewer: Pick<MaintenanceViewer, "isAdmin" | "isManager" | "isIt">,
): MaintenanceTab {
  const tabs = availableTabs(viewer);
  if (requested && (tabs as string[]).includes(requested)) return requested as MaintenanceTab;
  if (viewer.isIt) return "rooms";
  if (seesAll(viewer)) return "all";
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

// ─── Statistics (IT manager and admin) ──────────────────────────────────────

export const STATS_RANGES = ["month", "lastMonth", "30days", "schoolYear", "all"] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export function isStatsRange(v: unknown): v is StatsRange {
  return typeof v === "string" && (STATS_RANGES as readonly string[]).includes(v);
}

/**
 * The [from, to) window of a range, in UTC, relative to `today` (UTC midnight).
 * The school year starts on 1 September. Null bounds are open.
 */
export function statsWindow(range: StatsRange, today: Date): { from: Date | null; to: Date | null } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (range) {
    case "month":
      return { from: new Date(Date.UTC(y, m, 1)), to: null };
    case "lastMonth":
      return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
    case "30days":
      return { from: new Date(today.getTime() - 29 * 86_400_000), to: null };
    case "schoolYear":
      return { from: new Date(Date.UTC(m >= 8 ? y : y - 1, 8, 1)), to: null };
    default:
      return { from: null, to: null };
  }
}

/** One resolution: who closed which request, for what equipment, and the time logged. */
export interface Resolution {
  personId: string;
  personName: string;
  requestId: string;
  equipment: Equipment;
  minutes: number | null;
}

export interface StatsRow {
  /** Distinct requests resolved. A request reopened and resolved again counts once. */
  jobs: number;
  /** Every minute logged, re-resolutions included. */
  minutes: number;
  /** Resolutions with no time — recorded before the time was asked for. */
  untimed: number;
  /** Distinct requests with at least one timed resolution — the average's divisor. */
  timedJobs: number;
}

export interface MaintenanceStats {
  total: StatsRow;
  byPerson: (StatsRow & { personId: string; personName: string })[];
  byEquipment: (StatsRow & { equipment: Equipment })[];
}

function tally(rs: readonly Resolution[]): StatsRow {
  return {
    jobs: new Set(rs.map((r) => r.requestId)).size,
    minutes: rs.reduce((sum, r) => sum + (r.minutes ?? 0), 0),
    untimed: rs.filter((r) => r.minutes === null).length,
    timedJobs: new Set(rs.filter((r) => r.minutes !== null).map((r) => r.requestId)).size,
  };
}

function groupBy<K>(rs: readonly Resolution[], key: (r: Resolution) => K): Map<K, Resolution[]> {
  const m = new Map<K, Resolution[]>();
  for (const r of rs) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

/** People by jobs then time (most first); equipment in its usual order. */
export function maintenanceStats(rs: readonly Resolution[]): MaintenanceStats {
  const byPerson = [...groupBy(rs, (r) => r.personId).values()]
    .map((list) => ({ personId: list[0]!.personId, personName: list[0]!.personName, ...tally(list) }))
    .sort((a, b) => b.jobs - a.jobs || b.minutes - a.minutes || a.personName.localeCompare(b.personName, "el"));
  const eq = groupBy(rs, (r) => r.equipment);
  const byEquipment = EQUIPMENT.filter((e) => eq.has(e)).map((e) => ({ equipment: e, ...tally(eq.get(e)!) }));
  return { total: tally(rs), byPerson, byEquipment };
}

/** Average minutes per timed job, rounded; null when nothing was timed. */
export function averageMinutes(row: StatsRow): number | null {
  return row.timedJobs > 0 ? Math.round(row.minutes / row.timedJobs) : null;
}

/** 95 → { h: 1, m: 35 }. */
export function splitMinutes(total: number): { h: number; m: number } {
  return { h: Math.floor(total / 60), m: total % 60 };
}
