import { db } from "@/server/db";
import { DateInput } from "@/components/ui/date-input";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { createActivity } from "../actions";
import { weeklyOccurrences } from "@/lib/activities";
import { localDateStr, normalizeIsoDate } from "@/lib/dates";
import { getPeriodsPerDay, maxPeriodCount } from "@/lib/schoolConfig";
import { utcMidnight } from "@/lib/dates";
import { AlertTriangle } from "lucide-react";
import { SelectAllButton } from "./SelectAllButton";

export default async function NewActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    name?: string;
    date?: string;
    startPeriod?: string;
    endPeriod?: string;
    location?: string;
    repeatUntil?: string;
    grade?: string;
    groupId?: string;
  }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { name, date, startPeriod, endPeriod, location, repeatUntil, grade, groupId } =
    await searchParams;

  const todayStr = localDateStr();
  const gradeNum = grade ? parseInt(grade) : undefined;

  // Details are "confirmed" once they've been saved to the URL via the GET form
  const detailsConfirmed = !!(name && date);

  // Weekly repeat preview: how many activities will be created.
  const occurrences = date ? weeklyOccurrences(date, normalizeIsoDate(repeatUntil)) : [];

  const allGroups = await db.group.findMany({
    where: { students: { some: {} } },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });
  const filteredGroups = gradeNum
    ? allGroups.filter((g) => g.grade === gradeNum)
    : [];

  const students =
    groupId && detailsConfirmed
      ? await db.studentProfile.findMany({
          where: { groupId, user: { isActive: true } },
          include: { user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : [];

  // Test conflict check — find tests that overlap with this activity's period range
  type TestWarning = {
    courseName: string;
    groupName: string;
    staffName: string | null;
    type: "BIG" | "SMALL";
    periodLabel: string;
    affectedCount: number;
  };
  let testWarnings: TestWarning[] = [];

  if (groupId && detailsConfirmed && date && startPeriod && endPeriod && students.length > 0) {
    const actStart = Math.min(parseInt(startPeriod), parseInt(endPeriod));
    const actEnd = Math.max(parseInt(startPeriod), parseInt(endPeriod));

    // All groups the homeroom students belong to
    const studentsWithGroups = await db.studentProfile.findMany({
      where: { groupId, user: { isActive: true } },
      select: {
        id: true,
        groupId: true,
        subjectGroups: { select: { groupId: true } },
      },
    });
    const allGroupIds = [
      ...new Set(
        studentsWithGroups.flatMap((s) => [
          ...(s.groupId ? [s.groupId] : []),
          ...s.subjectGroups.map((sg) => sg.groupId),
        ])
      ),
    ];

    const testsOnDate = await db.testSchedule.findMany({
      where: {
        date: utcMidnight(date),
        groupId: { in: allGroupIds },
      },
      include: {
        course: { select: { name: true } },
        group: { select: { name: true, id: true } },
        staff: { include: { user: { select: { name: true } } } },
      },
    });

    // Filter to tests that overlap the activity's period range
    const overlapping = testsOnDate.filter(
      (t) => t.period <= actEnd && t.period + t.periodCount - 1 >= actStart
    );

    // Count how many students are affected by each test
    for (const t of overlapping) {
      const affectedCount = studentsWithGroups.filter((s) =>
        (s.groupId === t.groupId) ||
        s.subjectGroups.some((sg) => sg.groupId === t.groupId)
      ).length;

      testWarnings.push({
        courseName: t.course.name,
        groupName: t.group.name,
        staffName: t.staff?.scheduleName ?? t.staff?.user?.name ?? null,
        type: t.type,
        periodLabel: t.periodCount > 1 ? `P${t.period}–${t.period + t.periodCount - 1}` : `P${t.period}`,
        affectedCount,
      });
    }
  }

  // Check if selected date falls on a special day
  const selectedDateMidnight = date ? utcMidnight(date) : null;
  const dateSpecialDay = selectedDateMidnight
    ? await db.specialDay.findFirst({
        where: { startDate: { lte: selectedDateMidnight }, endDate: { gte: selectedDateMidnight } },
        select: { type: true, label: true, eventStartPeriod: true, eventEndPeriod: true },
      })
    : null;

  // Build base URL params (activity details only, no grade/groupId)
  function detailParams() {
    const p = new URLSearchParams();
    if (name) p.set("name", name);
    if (date) p.set("date", date);
    if (startPeriod) p.set("startPeriod", startPeriod);
    if (endPeriod) p.set("endPeriod", endPeriod);
    if (location) p.set("location", location);
    if (repeatUntil) p.set("repeatUntil", repeatUntil);
    return p;
  }

  function yearUrl(g: number) {
    const p = detailParams();
    p.set("grade", String(g));
    return `?${p.toString()}`;
  }

  function groupUrl(gId: string) {
    const p = detailParams();
    if (gradeNum) p.set("grade", String(gradeNum));
    p.set("groupId", gId);
    return `?${p.toString()}`;
  }

  const periodsConfig = await getPeriodsPerDay();
  const periods = Array.from({ length: maxPeriodCount(periodsConfig) }, (_, i) => i + 1);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/teacher/activities`}
          className="text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">Νέα Δραστηριότητα</h2>
      </div>

      {/* ── Step 1: Activity details (GET form) ───────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Βήμα 1 — Στοιχεία Δραστηριότητας
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Όνομα δραστηριότητας
              </label>
              <input
                name="name"
                required
                defaultValue={name}
                placeholder="π.χ. Πρόβα Θεατρικού Ομίλου"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Ημερομηνία</label>
              <DateInput
                name="date"
                required
                defaultValue={date ?? todayStr}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
              {dateSpecialDay && (() => {
                const HOLIDAY_TYPES = ["BANK_HOLIDAY", "CHRISTMAS", "EASTER", "OTHER_HOLIDAY"];
                const isHoliday = HOLIDAY_TYPES.includes(dateSpecialDay.type);
                const isExcursion = dateSpecialDay.type === "EXCURSION";
                const isEvent = dateSpecialDay.type === "SCHOOL_EVENT";
                const isIntercalary = dateSpecialDay.type === "INTERCALARY";
                const { bg, border, text, icon } = isHoliday
                  ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: "🔴" }
                  : isExcursion
                  ? { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: "🔵" }
                  : isEvent
                  ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "🟡" }
                  : { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", icon: "🟣" };
                const periodSuffix = isEvent && dateSpecialDay.eventStartPeriod != null && dateSpecialDay.eventEndPeriod != null
                  ? ` (${dateSpecialDay.eventStartPeriod === dateSpecialDay.eventEndPeriod
                      ? `Ώρα ${dateSpecialDay.eventStartPeriod}`
                      : `Ώρες ${dateSpecialDay.eventStartPeriod}–${dateSpecialDay.eventEndPeriod}`})`
                  : "";
                const typeLabel =
                  isHoliday ? "Αργία" :
                  isExcursion ? "Εκδρομή" :
                  isEvent ? `Σχολική Εκδήλωση${periodSuffix}` :
                  isIntercalary ? "Εμβόλιμη Περίοδος" : dateSpecialDay.type;
                return (
                  <div className={`flex items-center gap-2 rounded-lg border ${border} ${bg} px-3 py-2 text-xs ${text}`}>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      <strong>{typeLabel}</strong>
                      {dateSpecialDay.label ? ` — ${dateSpecialDay.label}` : ""}
                      {isHoliday ? " · Σχολείο κλειστό αυτή την ημέρα." : ""}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Από περίοδο
                </label>
                <select
                  name="startPeriod"
                  defaultValue={startPeriod ?? "1"}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      Περίοδος {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Έως περίοδο
                </label>
                <select
                  name="endPeriod"
                  defaultValue={endPeriod ?? "1"}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      Περίοδος {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Τοποθεσία{" "}
                <span className="text-slate-400 font-normal">(προαιρετικά)</span>
              </label>
              <input
                name="location"
                defaultValue={location}
                placeholder="π.χ. Αίθουσα Α, Γυμναστήριο, Εκτός σχολείου"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Εβδομαδιαία επανάληψη έως{" "}
                <span className="text-slate-400 font-normal">(προαιρετικά)</span>
              </label>
              <DateInput
                name="repeatUntil"
                defaultValue={repeatUntil ?? ""}
                min={date ?? todayStr}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
              <p className="text-xs text-slate-400">
                Δημιουργεί την ίδια δραστηριότητα κάθε εβδομάδα την ίδια ημέρα, μέχρι αυτή την ημερομηνία.
              </p>
            </div>

            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800"
            >
              Αποθήκευση Στοιχείων →
            </button>
          </form>
        </CardContent>
      </Card>

      {/* ── Step 2: Select students ──────────────────────────────────── */}
      <Card className={!detailsConfirmed ? "opacity-50 pointer-events-none" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Βήμα 2 — Επιλογή Μαθητών</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!detailsConfirmed && (
            <p className="text-sm text-slate-400">
              Ολοκληρώστε πρώτα το Βήμα 1 για να επιλέξετε μαθητές.
            </p>
          )}

          {detailsConfirmed && (
            <>
              {/* Year */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Τάξη
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3].map((g) => (
                    <Link
                      key={g}
                      href={yearUrl(g)}
                      className={cn(
                        "h-9 px-5 rounded-lg text-sm font-medium transition-colors border",
                        gradeNum === g
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                      )}
                    >
                      {g}η
                    </Link>
                  ))}
                </div>
              </div>

              {/* Homegroup */}
              {gradeNum && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Τμήμα
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {filteredGroups.map((g) => (
                      <Link
                        key={g.id}
                        href={groupUrl(g.id)}
                        className={cn(
                          "h-9 px-5 rounded-lg text-sm font-medium transition-colors border",
                          groupId === g.id
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                        )}
                      >
                        {g.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Test conflict warning */}
              {testWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-amber-800">
                      Διαγωνίσματα προγραμματισμένα σε αυτές τις περιόδους
                    </p>
                  </div>
                  <div className="divide-y divide-amber-100 px-4">
                    {testWarnings.map((w, i) => (
                      <div key={i} className="py-3 flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <p className="text-sm font-medium text-amber-900">
                            {w.courseName}
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-semibold ${
                              w.type === "BIG"
                                ? "bg-slate-800 text-white"
                                : "bg-slate-100 text-slate-600"
                            }`}>
                              {w.type === "BIG" ? "Μεγάλο" : "Μικρό"}
                            </span>
                          </p>
                          <p className="text-xs text-amber-600 mt-0.5">
                            {w.groupName} · {w.periodLabel}
                            {w.staffName && ` · ${w.staffName}`}
                          </p>
                        </div>
                        <span className="text-xs text-amber-700 bg-amber-100 rounded-full px-2 py-1 whitespace-nowrap">
                          {w.affectedCount === 1
                            ? "1 μαθητής επηρεάζεται"
                            : `${w.affectedCount} μαθητές επηρεάζονται`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="px-4 py-2.5 text-xs text-amber-600 border-t border-amber-200">
                    Μπορείτε να δημιουργήσετε τη δραστηριότητα — αυτό είναι μόνο για ενημέρωσή σας.
                  </p>
                </div>
              )}

              {/* Students */}
              {groupId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Μαθητές —{" "}
                      {allGroups.find((g) => g.id === groupId)?.name}
                    </p>
                    {students.length > 0 && <SelectAllButton formId="create-activity-form" />}
                  </div>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {students.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-slate-400">
                        Δεν υπάρχουν μαθητές σε αυτό το τμήμα
                      </p>
                    ) : (
                      students.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                          id={`student-${s.id}`}
                        >
                          <input
                            type="checkbox"
                            form="create-activity-form"
                            name="studentId"
                            value={s.id}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm font-medium text-slate-900">
                            {s.user?.name}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Create form (POST) — always rendered but hidden until step 1 done ── */}
      {detailsConfirmed && (
        <form id="create-activity-form" action={createActivity}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="name" value={name ?? ""} />
          <input type="hidden" name="date" value={date ?? todayStr} />
          <input type="hidden" name="startPeriod" value={startPeriod ?? "1"} />
          <input type="hidden" name="endPeriod" value={endPeriod ?? "1"} />
          <input type="hidden" name="location" value={location ?? ""} />
          <input type="hidden" name="repeatUntil" value={repeatUntil ?? ""} />

          {occurrences.length > 1 && (
            <p className="mb-3 text-sm text-emerald-700">
              Θα δημιουργηθούν {occurrences.length} δραστηριότητες (εβδομαδιαία επανάληψη).
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              className="h-10 px-6 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              {occurrences.length > 1 ? "Δημιουργία Δραστηριοτήτων" : "Δημιουργία Δραστηριότητας"}
            </button>
            <Link
              href={`/${locale}/teacher/activities`}
              className="h-10 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 inline-flex items-center"
            >
              Άκυρο
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
