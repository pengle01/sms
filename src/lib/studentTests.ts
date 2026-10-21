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
