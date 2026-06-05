import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveAuth } from "@/server/authz";
import { db } from "@/server/db";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { utcMidnight } from "@/lib/dates";
import { dutyDowFor, isDutyEligible, isOnDuty } from "@/lib/dutyRoster";
import { locateHref, parseLocateTab, studentSearchWhere, type LocateTab, type LocateParams } from "@/lib/studentSearch";
import { suggestionList } from "@/lib/textSearch";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY } from "@/lib/schoolConfig";
import { permitContactLabel } from "@/lib/exitPermit";
import { getDayOverrides } from "@/server/substitutions";
import { periodsForDow } from "@/lib/periods";
import { SuggestInput } from "@/components/SuggestInput";
import { cn } from "@/lib/utils";
import { BellOff, CheckCircle2, LogOut, Phone, Printer, Search, X } from "lucide-react";
import { issueExitPermit, cancelExitPermit } from "./actions";
import { ReferralTabs } from "@/components/referrals/ReferralTabs";

export default async function TeacherDutyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    tab?: string;
    grade?: string;
    groupId?: string;
    q?: string;
    student?: string;
    error?: string;
  }>;
}) {
  const { locale } = await params;
  const { tab: tabParam, grade, groupId, q, student: selectedStudentId, error } = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  if (!isDutyEligible(auth.role)) redirect(`/${locale}/teacher/dashboard`);

  const t = await getTranslations("duty");
  const tLocate = await getTranslations("locate");
  const tDash = await getTranslations("dashboard");

  const today = utcMidnight();
  const todayDow = dutyDowFor(today);
  const [todayEntries, me, overrides] = await Promise.all([
    todayDow
      ? db.dutyRosterEntry.findMany({
          where: { dayOfWeek: todayDow },
          select: { dayOfWeek: true, staffProfileId: true },
        })
      : Promise.resolve([]),
    db.staffProfile.findUnique({ where: { userId: auth.userId }, select: { id: true } }),
    getDayOverrides(today),
  ]);
  // Study-hall groups from today's finalized substitution plan — every
  // headteacher sees them here and takes their attendance.
  const studyHallsToday = overrides?.studyHalls ?? [];

  // Which of them already have attendance recorded today (green = done, red = pending)
  const hallSlotIds = studyHallsToday
    .map((e) => e.timetableSlotId)
    .filter(Boolean) as string[];
  const markedHalls =
    hallSlotIds.length > 0
      ? await db.attendance.findMany({
          where: { date: today, timetableSlotId: { in: hallSlotIds } },
          select: { timetableSlotId: true },
          distinct: ["timetableSlotId"],
        })
      : [];
  const markedHallSlotIds = new Set(markedHalls.map((m) => m.timetableSlotId));
  const onDutyToday = isOnDuty(todayEntries, todayDow, me?.id ?? null);

  // ── Permit desk: same tabbed locator as attendance/locate ────────────────
  const tab = parseLocateTab(tabParam);
  const query = (q ?? "").trim();
  const gradeNum = grade ? parseInt(grade) : undefined;
  const current: LocateParams = { tab, grade, groupId, q: query };
  const currentQs = locateHref(current, {}).slice(1);
  // Selecting a student keeps the locator filters so the next student from the
  // same group is two clicks away.
  const selectHref = (studentId: string) => {
    const sp = new URLSearchParams(currentQs);
    sp.set("student", studentId);
    return `?${sp.toString()}`;
  };

  const matchesWhere = !onDutyToday
    ? null
    : tab === "group"
      ? groupId
        ? { groupId, user: { isActive: true } }
        : null
      : studentSearchWhere(tab, query);

  const [todayPermits, homeroomGroups, matches, suggestionRows, selectedStudent, periodsConfig] = onDutyToday
    ? await Promise.all([
        db.exitPermit.findMany({
          where: { date: today },
          include: {
            student: { include: { user: { select: { name: true } }, group: { select: { name: true } } } },
            issuer: { include: { user: { select: { name: true } } } },
            smsContact: { select: { name: true, role: true, phone: true } },
          },
          orderBy: { issuedAt: "desc" },
        }),
        tab === "group" && gradeNum
          ? db.group.findMany({
              where: { grade: gradeNum, students: { some: {} } },
              orderBy: [{ grade: "asc" }, { name: "asc" }],
            })
          : Promise.resolve([]),
        matchesWhere
          ? db.studentProfile.findMany({
              where: matchesWhere,
              include: { user: { select: { name: true } }, group: { select: { name: true } } },
              orderBy: { user: { name: "asc" } },
              ...(tab === "group" ? {} : { take: 50 }),
            })
          : Promise.resolve([]),
        tab === "group"
          ? Promise.resolve([])
          : db.studentProfile.findMany({
              where: { user: { isActive: true } },
              select: { studentId: true, user: { select: { name: true } } },
            }),
        selectedStudentId
          ? db.studentProfile.findFirst({
              where: { id: selectedStudentId, user: { isActive: true } },
              include: {
                user: { select: { name: true } },
                group: { select: { name: true } },
                // The deputy phones the parents before issuing — show who to call.
                smsContacts: {
                  where: { active: true },
                  select: { id: true, name: true, phone: true, role: true },
                  orderBy: { name: "asc" },
                },
              },
            })
          : Promise.resolve(null),
        getPeriodsPerDay(),
      ])
    : [[], [], [], [], null, null];

  const suggestions = suggestionList(
    suggestionRows.map((s) => (tab === "name" ? s.user?.name : s.studentId))
  );
  const periods = todayDow
    ? periodsForDow({ ...DEFAULT_PERIODS_PER_DAY, ...(periodsConfig ?? {}) }, todayDow)
    : [];
  const issueAction = issueExitPermit.bind(null, locale);
  const selectedGroup = groupId ? homeroomGroups.find((g) => g.id === groupId) ?? null : null;

  const tabs: { key: LocateTab; label: string }[] = [
    { key: "group", label: tLocate("searchTabGroup") },
    { key: "name", label: tLocate("searchTabName") },
    { key: "id", label: tLocate("searchTabId") },
  ];

  // Filters travel through the issue form so redirects keep the desk state.
  const filterFields = (
    <>
      <input type="hidden" name="tab" value={tab} />
      {grade && <input type="hidden" name="grade" value={grade} />}
      {groupId && <input type="hidden" name="groupId" value={groupId} />}
      {query && <input type="hidden" name="q" value={query} />}
    </>
  );

  // ── Tab: Απουσιολόγια — study-hall groups per period needing attendance ───
  const attendanceContent =
    studyHallsToday.length === 0 ? (
      <p className="text-sm text-slate-400">{t("noStudyHalls")}</p>
    ) : (
      <Card className="border-sky-200 max-w-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tDash("studyHallsTitle")}</CardTitle>
          <p className="text-xs text-slate-400">{tDash("studyHallsHint")}</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-50">
            {studyHallsToday.map((e) => {
              const marked = !!e.timetableSlotId && markedHallSlotIds.has(e.timetableSlotId);
              return (
                <Link
                  key={e.id}
                  href={`/${locale}/teacher/attendance/mark?groupId=${e.groupId}&period=${e.period}`}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3 transition-colors border-l-4",
                    marked
                      ? "border-l-green-500 bg-green-50/40 hover:bg-green-50/70"
                      : "border-l-red-500 bg-red-50/30 hover:bg-red-50/60"
                  )}
                >
                  <span
                    className={cn(
                      "w-5 flex-shrink-0 text-center text-sm font-bold",
                      marked ? "text-green-500" : "text-red-400"
                    )}
                  >
                    {e.period}
                  </span>
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">{e.group?.name}</span>
                    {e.timetableSlot?.course.name && (
                      <span className="text-sm text-slate-400">{e.timetableSlot.course.name}</span>
                    )}
                    {e.absentStaff && (
                      <span className="text-xs text-slate-400">({e.absentStaff.scheduleName})</span>
                    )}
                    {e.newRoom && (
                      <span className="text-xs text-slate-400 font-mono">{tDash("room", { room: e.newRoom })}</span>
                    )}
                  </div>
                  {marked ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      {t("attendanceTaken")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-red-600">{t("attendancePending")}</span>
                      <span className="text-xs font-medium text-emerald-600">{tDash("markAttendance")}</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );

  // ── Tab: Άδειες Εξόδου — the permit desk ──────────────────────────────────
  const permitsContent = !onDutyToday ? (
        <Card className="max-w-xl">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 bg-slate-100 text-slate-400">
              <BellOff className="w-5 h-5" />
            </div>
            <p className="text-sm text-slate-500">
              {todayDow === null ? t("noDutyWeekend") : t("notOnDuty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2 items-start">
          {/* Issue desk */}
          <Card className="border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <LogOut className="w-4 h-4 text-yellow-600" />
                {t("issueTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  {t(error as Parameters<typeof t>[0])}
                </div>
              )}

              {/* Issue form for the selected student */}
              {selectedStudent && (
                <form action={issueAction} className="space-y-3 rounded-lg border border-yellow-200 bg-yellow-50/50 p-4">
                  {filterFields}
                  <input type="hidden" name="studentId" value={selectedStudent.id} />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {t("issueFor")}{" "}
                      <span className="text-yellow-800">{selectedStudent.user?.name}</span>
                      {selectedStudent.group?.name && (
                        <Badge variant="outline" className="ml-2 text-xs align-middle">{selectedStudent.group.name}</Badge>
                      )}
                    </p>
                    <Link
                      href={locateHref(current, {})}
                      aria-label={t("clearSelection")}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </Link>
                  </div>

                  {/* Parent contacts — the deputy calls, then picks who agreed */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      {selectedStudent.smsContacts.length === 0 ? t("contacts") : t("contactsPick")}
                    </p>
                    {selectedStudent.smsContacts.length === 0 ? (
                      <p className="text-sm text-slate-400">{t("noContacts")}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {selectedStudent.smsContacts.map((c) => (
                          <li key={c.id}>
                            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 cursor-pointer has-[:checked]:border-yellow-400 has-[:checked]:bg-yellow-50">
                              <span className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="radio"
                                  name="smsContactId"
                                  value={c.id}
                                  required
                                  className="accent-yellow-500"
                                />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium text-slate-800 truncate">{c.name}</span>
                                  <span className="block text-xs text-slate-400">{t(`parentRoles.${c.role}` as Parameters<typeof t>[0])}</span>
                                </span>
                              </span>
                              <a
                                href={`tel:${c.phone}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 whitespace-nowrap"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                {c.phone}
                              </a>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <label htmlFor="fromPeriod" className="text-slate-600">{t("fromPeriod")}</label>
                    <select
                      id="fromPeriod"
                      name="fromPeriod"
                      className="h-8 px-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {periods.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <span className="text-slate-500 text-xs">{t("untilEnd")}</span>
                  </div>
                  <input
                    name="reason"
                    required
                    placeholder={t("reason")}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {/* Free-text contact only when the student has no contacts on record */}
                  {selectedStudent.smsContacts.length === 0 && (
                    <input
                      name="contactNote"
                      required
                      placeholder={t("contactNote")}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                  <button
                    type="submit"
                    className="h-9 px-4 rounded-lg bg-yellow-500 text-white text-sm font-semibold hover:bg-yellow-600"
                  >
                    {t("issue")}
                  </button>
                </form>
              )}

              {/* Student locator — same tabs as attendance/locate */}
              <div className="flex gap-1 border-b border-slate-200">
                {tabs.map((tb) => (
                  <Link
                    key={tb.key}
                    href={locateHref(current, { tab: tb.key })}
                    className={cn(
                      "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                      tab === tb.key
                        ? "border-emerald-600 text-emerald-700"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    )}
                  >
                    {tb.label}
                  </Link>
                ))}
              </div>

              {tab === "group" ? (
                <>
                  {/* Step 1 — Year */}
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3].map((g) => (
                      <Link
                        key={g}
                        /* Switching year clears the group selection (it belongs to the old year). */
                        href={locateHref(current, { grade: String(g), groupId: g === gradeNum ? groupId : undefined })}
                        className={cn(
                          "h-9 px-5 rounded-xl text-sm font-medium transition-colors border",
                          gradeNum === g
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                        )}
                      >
                        {tLocate("yearN", { n: g })}
                      </Link>
                    ))}
                  </div>

                  {/* Step 2 — Homegroup */}
                  {gradeNum ? (
                    homeroomGroups.length > 0 ? (
                      <div className="flex gap-2 flex-wrap">
                        {homeroomGroups.map((g) => (
                          <Link
                            key={g.id}
                            href={locateHref(current, { groupId: g.id })}
                            className={cn(
                              "h-9 px-4 rounded-xl text-sm font-medium transition-colors border",
                              groupId === g.id
                                ? "bg-slate-800 text-white border-slate-800"
                                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                            )}
                          >
                            {g.name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">{tLocate("noHomegroups", { n: gradeNum })}</p>
                    )
                  ) : (
                    <p className="text-sm text-slate-400">{tLocate("selectYear")}</p>
                  )}
                </>
              ) : (
                /* Name / ID search */
                <form method="GET" className="relative">
                  <input type="hidden" name="tab" value={tab} />
                  {/* Keep the group-tab selection alive while searching */}
                  {grade && <input type="hidden" name="grade" value={grade} />}
                  {groupId && <input type="hidden" name="groupId" value={groupId} />}
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                  <SuggestInput
                    name="q"
                    defaultValue={query}
                    placeholder={tab === "name" ? tLocate("searchByName") : tLocate("searchById")}
                    suggestions={suggestions}
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </form>
              )}

              {/* Matches — pick the student to issue for */}
              {matchesWhere && (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {matches.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400">{tLocate("noResults")}</p>
                  ) : (
                    matches.map((s) => (
                      <Link
                        key={s.id}
                        href={selectHref(s.id)}
                        className={cn(
                          "flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50",
                          s.id === selectedStudent?.id && "bg-yellow-50/70"
                        )}
                      >
                        <span className="font-medium text-slate-900">{s.user?.name}</span>
                        <span className="flex items-center gap-2 text-xs text-slate-500">
                          {tab !== "group" && s.group?.name && (
                            <Badge variant="outline" className="text-xs">{s.group.name}</Badge>
                          )}
                          <span className="font-mono">{s.studentId}</span>
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              )}
              {tab !== "group" && !query && (
                <p className="text-sm text-slate-400">{tLocate("enterSearch")}</p>
              )}
              {tab === "group" && selectedGroup && matches.length > 0 && (
                <p className="text-xs text-slate-400 -mt-2">
                  {selectedGroup.name} · {tLocate("studentsCount", { count: matches.length })}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Today's granted permits */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="w-4 h-4 text-slate-400" />
                {t("todayPermits")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayPermits.length === 0 ? (
                <p className="text-sm text-slate-400">{t("noPermitsToday")}</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {todayPermits.map((p) => (
                    <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {p.student.user?.name}
                          {p.student.group?.name && (
                            <span className="ml-2 text-xs font-normal text-slate-400">{p.student.group.name}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t("leavesFrom", { period: p.fromPeriod })} · {p.reason}
                        </p>
                        {permitContactLabel(p.smsContact, p.contactNote) && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {permitContactLabel(p.smsContact, p.contactNote)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                          href={`/${locale}/teacher/duty/permits/${p.id}/print`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-700"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          {t("print")}
                        </Link>
                        <form action={cancelExitPermit.bind(null, locale, p.id, currentQs)}>
                          <button
                            type="submit"
                            className="text-xs font-medium text-red-400 hover:text-red-600"
                          >
                            {t("cancelPermit")}
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
      </div>

      {/* Clear separation: permits vs attendance */}
      <ReferralTabs
        tabs={[
          {
            key: "permits",
            label: t("permitsTitle"),
            content: permitsContent,
          },
          {
            key: "attendance",
            label: t("attendanceTab"),
            content: attendanceContent,
          },
        ]}
      />
    </div>
  );
}
