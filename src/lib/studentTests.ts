// «Διαγωνίσματα των μαθητών μου»: other teachers' tests that the students I
// teach sit. A test belongs to one group (a homegroup or a subject/elective
// group); a student sits it when that group is their homegroup or one of their
// subject groups. Seen from each of my groups, a test can concern the whole
// group or only some of its students (e.g. those taking an elective).

export interface TaughtStudent {
  id: string;
  /** Every group the student belongs to: homegroup + subject groups. */
  groupIds: string[];
}

export interface TestAudienceRow {
  /** One of my groups. */
  groupId: string;
  /** Its students who sit the test. */
  studentIds: string[];
  /** How many students that group of mine has. */
  total: number;
  /** True when only part of the group sits the test. */
  partial: boolean;
}

/** For one test group: which of my groups it reaches, and how many of their students. */
export function testAudience(
  testGroupId: string,
  myGroupIds: string[],
  students: TaughtStudent[]
): TestAudienceRow[] {
  const rows: TestAudienceRow[] = [];
  for (const groupId of myGroupIds) {
    const inGroup = students.filter((s) => s.groupIds.includes(groupId));
    const sitting = inGroup.filter((s) => s.groupIds.includes(testGroupId));
    if (sitting.length === 0) continue;
    rows.push({
      groupId,
      studentIds: sitting.map((s) => s.id),
      total: inGroup.length,
      partial: sitting.length < inGroup.length,
    });
  }
  return rows;
}

/** The groups whose tests can concern my students: every group any of them belongs to. */
export function audienceGroupIds(students: TaughtStudent[]): string[] {
  return [...new Set(students.flatMap((s) => s.groupIds))];
}

// ── Filters for the tab ───────────────────────────────────────────────────────

export type TestRange = "week" | "2weeks" | "30days" | "all";

export interface StudentTestFilters {
  /** One of my groups, or null for all of them. */
  groupId: string | null;
  range: TestRange;
  type: "BIG" | "SMALL" | null;
  /** Only tests that just some of a group's students sit. */
  partialOnly: boolean;
}

/** Read the filters from the URL; anything unknown falls back to "no filter". */
export function parseStudentTestFilters(
  params: { group?: string; range?: string; type?: string; partial?: string },
  myGroupIds: string[]
): StudentTestFilters {
  const ranges: TestRange[] = ["week", "2weeks", "30days", "all"];
  return {
    groupId: params.group && myGroupIds.includes(params.group) ? params.group : null,
    range: ranges.includes(params.range as TestRange) ? (params.range as TestRange) : "all",
    type: params.type === "BIG" || params.type === "SMALL" ? params.type : null,
    partialOnly: params.partial === "1",
  };
}

/** The last day (inclusive, UTC midnight) a range covers from `today`; null = no end.
 *  "week" runs to this week's Friday (a weekend `today` looks at the coming week). */
export function rangeEnd(today: Date, range: TestRange): Date | null {
  const addDays = (n: number) => new Date(today.getTime() + n * 86_400_000);
  switch (range) {
    case "week": {
      const dow = today.getUTCDay(); // 0 Sun … 6 Sat
      return addDays(dow === 0 ? 5 : dow === 6 ? 6 : 5 - dow);
    }
    case "2weeks":
      return addDays(13);
    case "30days":
      return addDays(29);
    default:
      return null;
  }
}

/** Narrow one test's rows to the filters: null when the test drops out. */
export function filterAudience(rows: TestAudienceRow[], f: StudentTestFilters): TestAudienceRow[] | null {
  const kept = f.groupId ? rows.filter((r) => r.groupId === f.groupId) : rows;
  if (kept.length === 0) return null;
  if (f.partialOnly && !kept.some((r) => r.partial)) return null;
  return kept;
}
