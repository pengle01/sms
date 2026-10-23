import { describe, it, expect } from "vitest";
import {
  canFileMaintenance,
  isHandler,
  seesAll,
  canViewRequest,
  allowedTransitions,
  noteRequired,
  validateNewRequest,
  validateComment,
  validateStatusChange,
  timeRequired,
  minutesFrom,
  isValidMinutes,
  statsWindow,
  maintenanceStats,
  resolutionsOf,
  averageMinutes,
  splitMinutes,
  isStatsRange,
  MINUTES_MAX,
  type Resolution,
  itRecipients,
  notifiesFiler,
  availableTabs,
  resolveTab,
  filterRequests,
  sortRequests,
  unresolvedCount,
  DESCRIPTION_MAX,
  COMMENT_MAX,
  type MaintenanceViewer,
  type MaintenanceRow,
} from "@/lib/maintenance";

function viewer(over: Partial<MaintenanceViewer> = {}): MaintenanceViewer {
  return { userId: "u1", isAdmin: false, isManager: false, isIt: false, myRooms: new Set(), ...over };
}

// Β61 belongs to "me", Β62 to another maintainer, ΒΙΒΛ to nobody.
const ASSIGNED = new Set(["Β61", "Β62"]);

describe("canFileMaintenance", () => {
  it("allows educators, the office and the admin", () => {
    for (const r of ["TEACHER", "HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B", "STUDENT_COUNSELOR", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const) {
      expect(canFileMaintenance([r])).toBe(true);
    }
  });

  it("refuses students, parents and chaperones", () => {
    for (const r of ["STUDENT", "PARENT", "CHAPERONE"] as const) {
      expect(canFileMaintenance([r])).toBe(false);
    }
  });
});

describe("isHandler", () => {
  const it1 = viewer({ isIt: true, myRooms: new Set(["Β61"]) });

  it("an IT maintainer handles their own rooms", () => {
    expect(isHandler(it1, "Β61", ASSIGNED)).toBe(true);
  });

  it("but not a room assigned to another maintainer", () => {
    expect(isHandler(it1, "Β62", ASSIGNED)).toBe(false);
  });

  it("every IT maintainer handles a room nobody maintains", () => {
    expect(isHandler(it1, "ΒΙΒΛ", ASSIGNED)).toBe(true);
    expect(isHandler(viewer({ isIt: true }), "ΒΙΒΛ", ASSIGNED)).toBe(true);
  });

  it("the admin handles everything", () => {
    expect(isHandler(viewer({ isAdmin: true }), "Β62", ASSIGNED)).toBe(true);
  });

  it("a teacher without the designation handles nothing, even an unassigned room", () => {
    expect(isHandler(viewer(), "ΒΙΒΛ", ASSIGNED)).toBe(false);
  });
});

describe("canViewRequest", () => {
  it("the filer sees their own request", () => {
    expect(canViewRequest(viewer(), { room: "Β62", createdById: "u1" }, ASSIGNED)).toBe(true);
  });

  it("another teacher does not see it", () => {
    expect(canViewRequest(viewer({ userId: "u2" }), { room: "Β62", createdById: "u1" }, ASSIGNED)).toBe(false);
  });

  it("a request whose filer was deleted stays visible to its handlers only", () => {
    expect(canViewRequest(viewer({ isAdmin: true }), { room: "Β62", createdById: null }, ASSIGNED)).toBe(true);
    expect(canViewRequest(viewer(), { room: "Β62", createdById: null }, ASSIGNED)).toBe(false);
  });
});

describe("allowedTransitions", () => {
  it("a handler moves a request forward and can reopen it", () => {
    expect(allowedTransitions(["handler"], "OPEN")).toEqual(["IN_PROGRESS", "RESOLVED"]);
    expect(allowedTransitions(["handler"], "IN_PROGRESS")).toEqual(["OPEN", "RESOLVED"]);
    expect(allowedTransitions(["handler"], "RESOLVED")).toEqual(["OPEN"]);
  });

  it("the filer can only reopen a resolved request", () => {
    expect(allowedTransitions(["filer"], "OPEN")).toEqual([]);
    expect(allowedTransitions(["filer"], "IN_PROGRESS")).toEqual([]);
    expect(allowedTransitions(["filer"], "RESOLVED")).toEqual(["OPEN"]);
  });

  it("someone who is both gets the union, without duplicates", () => {
    expect(allowedTransitions(["filer", "handler"], "RESOLVED")).toEqual(["OPEN"]);
    expect(allowedTransitions(["filer", "handler"], "OPEN")).toEqual(["IN_PROGRESS", "RESOLVED"]);
  });

  it("nobody gets nothing", () => {
    expect(allowedTransitions([], "OPEN")).toEqual([]);
  });
});

describe("noteRequired", () => {
  it("is required to resolve and to reopen", () => {
    expect(noteRequired("OPEN", "RESOLVED")).toBe(true);
    expect(noteRequired("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(noteRequired("RESOLVED", "OPEN")).toBe(true);
  });

  it("is optional when starting work or pausing it", () => {
    expect(noteRequired("OPEN", "IN_PROGRESS")).toBe(false);
    expect(noteRequired("IN_PROGRESS", "OPEN")).toBe(false);
  });
});

describe("validateNewRequest", () => {
  const rooms = new Set(["Β61", "ΒΙΒΛ"]);
  const ok = { room: "Β61", equipment: "PROJECTOR", description: "Δεν ανάβει" };

  it("accepts a valid request and trims it", () => {
    expect(validateNewRequest({ ...ok, room: " Β61 ", description: "  Δεν ανάβει  " }, rooms)).toEqual({
      ok: true,
      value: { room: "Β61", equipment: "PROJECTOR", description: "Δεν ανάβει" },
    });
  });

  it("rejects an unknown room", () => {
    expect(validateNewRequest({ ...ok, room: "Χ99" }, rooms)).toEqual({ ok: false, error: "errRoom" });
  });

  it("rejects an unknown equipment type", () => {
    expect(validateNewRequest({ ...ok, equipment: "TOASTER" }, rooms)).toEqual({ ok: false, error: "errEquipment" });
  });

  it("rejects an empty or overlong description", () => {
    expect(validateNewRequest({ ...ok, description: "   " }, rooms)).toEqual({ ok: false, error: "errDescription" });
    expect(validateNewRequest({ ...ok, description: "x".repeat(DESCRIPTION_MAX + 1) }, rooms)).toEqual({
      ok: false,
      error: "errDescriptionLong",
    });
  });
});

describe("validateComment", () => {
  it("accepts text and rejects blank or overlong comments", () => {
    expect(validateComment("Το έλεγξα")).toBeNull();
    expect(validateComment("  ")).toBe("errComment");
    expect(validateComment("x".repeat(COMMENT_MAX + 1))).toBe("errCommentLong");
  });
});

describe("validateStatusChange", () => {
  it("rejects a transition the actor may not make", () => {
    expect(validateStatusChange(["filer"], "OPEN", "RESOLVED", "done")).toBe("errTransition");
  });

  it("requires a note to resolve or reopen", () => {
    expect(validateStatusChange(["handler"], "OPEN", "RESOLVED", " ")).toBe("errNoteRequired");
    expect(validateStatusChange(["filer"], "RESOLVED", "OPEN", "")).toBe("errNoteRequired");
  });

  it("accepts a valid change, with or without an optional note", () => {
    expect(validateStatusChange(["handler"], "OPEN", "IN_PROGRESS", "")).toBeNull();
    expect(validateStatusChange(["handler"], "IN_PROGRESS", "RESOLVED", "Άλλαξα λάμπα", 30)).toBeNull();
  });

  it("requires the time spent to resolve, and only to resolve", () => {
    expect(validateStatusChange(["handler"], "IN_PROGRESS", "RESOLVED", "Άλλαξα λάμπα")).toBe("errTimeRequired");
    expect(validateStatusChange(["handler"], "IN_PROGRESS", "RESOLVED", "Άλλαξα λάμπα", 0)).toBe("errTimeRequired");
    expect(validateStatusChange(["handler"], "IN_PROGRESS", "RESOLVED", "x", MINUTES_MAX + 1)).toBe("errTimeRequired");
    expect(validateStatusChange(["filer"], "RESOLVED", "OPEN", "Δεν δουλεύει")).toBeNull();
    expect(timeRequired("RESOLVED")).toBe(true);
    expect(timeRequired("IN_PROGRESS")).toBe(false);
  });
});

describe("notifiesFiler", () => {
  it("tells the filer only when the request is resolved", () => {
    expect(notifiesFiler("RESOLVED")).toBe(true);
  });

  it("stays quiet when work starts or the request is reopened", () => {
    expect(notifiesFiler("IN_PROGRESS")).toBe(false);
    expect(notifiesFiler("OPEN")).toBe(false);
  });
});

describe("itRecipients", () => {
  it("notifies the room's maintainers when it has some", () => {
    expect(itRecipients(["it1"], ["it1", "it2"], [], "teacher")).toEqual(["it1"]);
  });

  it("falls back to every IT maintainer for an unassigned room", () => {
    expect(itRecipients([], ["it1", "it2"], [], "teacher")).toEqual(["it1", "it2"]);
  });

  it("never notifies the person who acted, and never twice", () => {
    expect(itRecipients(["it1", "it1", "it2"], [], [], "it1")).toEqual(["it2"]);
  });

  it("always adds the IT managers, once, but never the actor", () => {
    expect(itRecipients(["it1"], ["it1", "it2"], ["mgr"], "teacher")).toEqual(["it1", "mgr"]);
    expect(itRecipients([], ["it1"], ["mgr", "it1"], "teacher")).toEqual(["it1", "mgr"]);
    expect(itRecipients(["it1"], [], ["mgr"], "mgr")).toEqual(["it1"]);
  });
});

describe("availableTabs / resolveTab", () => {
  it("everyone has 'mine'; IT adds 'rooms'; the admin adds 'all'", () => {
    expect(availableTabs({ isAdmin: false, isManager: false, isIt: false })).toEqual(["mine"]);
    expect(availableTabs({ isAdmin: false, isManager: false, isIt: true })).toEqual(["mine", "rooms", "unassigned"]);
    expect(availableTabs({ isAdmin: true, isManager: false, isIt: false })).toEqual(["mine", "all"]);
  });

  it("defaults to the most useful tab", () => {
    expect(resolveTab(undefined, { isAdmin: false, isManager: false, isIt: false })).toBe("mine");
    expect(resolveTab(undefined, { isAdmin: false, isManager: false, isIt: true })).toBe("rooms");
    expect(resolveTab(undefined, { isAdmin: true, isManager: false, isIt: false })).toBe("all");
  });

  it("honours an allowed tab and ignores a forbidden one", () => {
    expect(resolveTab("mine", { isAdmin: false, isManager: false, isIt: true })).toBe("mine");
    expect(resolveTab("all", { isAdmin: false, isManager: false, isIt: false })).toBe("mine");
    expect(resolveTab("rooms", { isAdmin: false, isManager: false, isIt: false })).toBe("mine");
    expect(resolveTab("unassigned", { isAdmin: false, isManager: false, isIt: false })).toBe("mine");
    expect(resolveTab("unassigned", { isAdmin: false, isManager: false, isIt: true })).toBe("unassigned");
  });
});

describe("filterRequests / sortRequests / unresolvedCount", () => {
  const row = (over: Partial<MaintenanceRow>): MaintenanceRow => ({
    id: "r",
    room: "Β61",
    equipment: "PROJECTOR",
    status: "OPEN",
    description: "",
    createdByName: null,
    createdAt: new Date("2026-09-01T08:00:00Z"),
    ...over,
  });
  const rows = [
    row({ id: "a", room: "Β61", equipment: "PROJECTOR", status: "OPEN", description: "Ο προβολέας δεν ανάβει" }),
    row({ id: "b", room: "ΒΙΒΛ", equipment: "NETWORK", status: "RESOLVED", createdByName: "ΗΥ-ΠΑΠΑΔΟΠΟΥΛΟΥ Μ." }),
    row({ id: "c", room: "Β62", equipment: "TV", status: "IN_PROGRESS" }),
  ];

  it("filters by status and equipment", () => {
    expect(filterRequests(rows, { status: "RESOLVED" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRequests(rows, { equipment: "TV" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("ignores unknown filter values rather than emptying the list", () => {
    expect(filterRequests(rows, { status: "BOGUS", equipment: "TOASTER" })).toHaveLength(3);
  });

  it("searches room, description and filer without caring about Greek accents", () => {
    expect(filterRequests(rows, { q: "προβολεας" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterRequests(rows, { q: "παπαδοπουλου" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRequests(rows, { q: "β62" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("sorts open, then in progress, then resolved; newest first within each", () => {
    const newer = row({ id: "d", status: "OPEN", createdAt: new Date("2026-09-10T08:00:00Z") });
    expect(sortRequests([...rows, newer]).map((r) => r.id)).toEqual(["d", "a", "c", "b"]);
  });

  it("counts what is not yet resolved", () => {
    expect(unresolvedCount(rows)).toBe(2);
  });
});

describe("IT manager", () => {
  const mgr = viewer({ isManager: true });

  it("sees all, like the admin", () => {
    expect(seesAll(mgr)).toBe(true);
    expect(seesAll(viewer({ isIt: true }))).toBe(false);
  });

  it("handles and sees a room someone else maintains", () => {
    expect(isHandler(mgr, "Β62", ASSIGNED)).toBe(true);
    expect(canViewRequest(mgr, { room: "Β62", createdById: "other" }, ASSIGNED)).toBe(true);
  });

  it("gets every tab and lands on 'all'", () => {
    expect(availableTabs({ isAdmin: false, isManager: true, isIt: false })).toEqual(["mine", "rooms", "unassigned", "all"]);
    expect(resolveTab(undefined, { isAdmin: false, isManager: true, isIt: false })).toBe("all");
  });

  it("who is also an IT maintainer keeps the rooms inbox as default", () => {
    expect(availableTabs({ isAdmin: false, isManager: true, isIt: true })).toEqual(["mine", "rooms", "unassigned", "all"]);
    expect(resolveTab(undefined, { isAdmin: false, isManager: true, isIt: true })).toBe("rooms");
  });
});

describe("time spent", () => {
  it("reads hours and minutes as typed", () => {
    expect(minutesFrom("1", "30")).toBe(90);
    expect(minutesFrom("", "45")).toBe(45);
    expect(minutesFrom("2", "")).toBe(120);
  });

  it("rejects nothing, zero, fractions, negatives and minutes over 59", () => {
    expect(minutesFrom("", "")).toBeNull();
    expect(minutesFrom("0", "0")).toBeNull();
    expect(minutesFrom("1.5", "")).toBeNull();
    expect(minutesFrom("-1", "30")).toBeNull();
    expect(minutesFrom("0", "75")).toBeNull();
    expect(minutesFrom("101", "")).toBeNull();
  });

  it("validates a minutes value", () => {
    expect(isValidMinutes(1)).toBe(true);
    expect(isValidMinutes(MINUTES_MAX)).toBe(true);
    expect(isValidMinutes(0)).toBe(false);
    expect(isValidMinutes(2.5)).toBe(false);
    expect(isValidMinutes("30")).toBe(false);
    expect(isValidMinutes(null)).toBe(false);
  });

  it("splits minutes into hours and minutes", () => {
    expect(splitMinutes(95)).toEqual({ h: 1, m: 35 });
    expect(splitMinutes(45)).toEqual({ h: 0, m: 45 });
  });
});

describe("statsWindow", () => {
  const today = new Date(Date.UTC(2026, 9, 22)); // Thu 22/10/2026

  it("this month and last month", () => {
    expect(statsWindow("month", today)).toEqual({ from: new Date(Date.UTC(2026, 9, 1)), to: null });
    expect(statsWindow("lastMonth", today)).toEqual({
      from: new Date(Date.UTC(2026, 8, 1)),
      to: new Date(Date.UTC(2026, 9, 1)),
    });
  });

  it("last month across a new year", () => {
    expect(statsWindow("lastMonth", new Date(Date.UTC(2027, 0, 10))).from).toEqual(new Date(Date.UTC(2026, 11, 1)));
  });

  it("the last 30 days include today", () => {
    expect(statsWindow("30days", today).from).toEqual(new Date(Date.UTC(2026, 8, 23)));
  });

  it("the school year starts on 1 September", () => {
    expect(statsWindow("schoolYear", today).from).toEqual(new Date(Date.UTC(2026, 8, 1)));
    expect(statsWindow("schoolYear", new Date(Date.UTC(2027, 2, 16))).from).toEqual(new Date(Date.UTC(2026, 8, 1)));
  });

  it("all is unbounded; unknown ranges are refused", () => {
    expect(statsWindow("all", today)).toEqual({ from: null, to: null });
    expect(isStatsRange("all")).toBe(true);
    expect(isStatsRange("year")).toBe(false);
  });
});

describe("maintenanceStats", () => {
  const r = (personId: string, requestId: string, minutes: number | null, equipment: Resolution["equipment"] = "PROJECTOR"): Resolution =>
    ({ personId, personName: personId.toUpperCase(), requestId, equipment, minutes });

  it("counts jobs per person and sums their time", () => {
    const s = maintenanceStats([r("a", "1", 30), r("a", "2", 60), r("b", "3", 15)]);
    expect(s.byPerson.map((p) => [p.personId, p.jobs, p.minutes])).toEqual([["a", 2, 90], ["b", 1, 15]]);
    expect(s.total).toMatchObject({ jobs: 3, minutes: 105, untimed: 0 });
  });

  it("counts a reopened job once but adds every bit of time logged", () => {
    const s = maintenanceStats([r("a", "1", 30), r("a", "1", 20)]);
    expect(s.byPerson[0]).toMatchObject({ jobs: 1, minutes: 50 });
    expect(averageMinutes(s.byPerson[0]!)).toBe(50);
  });

  it("leaves untimed resolutions out of the average", () => {
    const s = maintenanceStats([r("a", "1", null), r("a", "2", 40)]);
    expect(s.total).toMatchObject({ jobs: 2, minutes: 40, untimed: 1, timedJobs: 1 });
    expect(averageMinutes(s.total)).toBe(40);
    expect(averageMinutes(maintenanceStats([r("a", "1", null)]).total)).toBeNull();
  });

  it("groups by equipment in the usual order", () => {
    const s = maintenanceStats([r("a", "1", 10, "NETWORK"), r("a", "2", 20, "LAPTOP"), r("b", "3", 5, "LAPTOP")]);
    expect(s.byEquipment.map((e) => [e.equipment, e.jobs, e.minutes])).toEqual([["LAPTOP", 2, 25], ["NETWORK", 1, 10]]);
  });

  it("is empty for no resolutions", () => {
    const s = maintenanceStats([]);
    expect(s.total).toMatchObject({ jobs: 0, minutes: 0 });
    expect(s.byPerson).toEqual([]);
    expect(s.byEquipment).toEqual([]);
  });
});

describe("resolutionsOf", () => {
  const rs: Resolution[] = [
    { personId: "a", personName: "A", requestId: "1", equipment: "TV", minutes: 10 },
    { personId: "b", personName: "B", requestId: "2", equipment: "TV", minutes: 20 },
  ];

  it("narrows to one person", () => {
    const v = resolutionsOf(rs, "a");
    expect(v.personId).toBe("a");
    expect(v.rows.map((r) => r.requestId)).toEqual(["1"]);
  });

  it("is everyone with no person, or one with no resolutions in the period", () => {
    expect(resolutionsOf(rs, null)).toEqual({ personId: null, rows: rs });
    expect(resolutionsOf(rs, "gone")).toEqual({ personId: null, rows: rs });
  });
});
