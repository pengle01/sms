import { db } from "@/server/db";
import { DateInput } from "@/components/ui/date-input";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { createActivity } from "../actions";
import { weeklyOccurrences, copyDefaults, type ActivityTestConflict } from "@/lib/activities";
import { localDateStr, normalizeIsoDate, fmtDisplayDate } from "@/lib/dates";
import { getPeriodsPerDay, maxPeriodCount } from "@/lib/schoolConfig";
import { utcMidnight } from "@/lib/dates";
import { AlertTriangle } from "lucide-react";
import { ActivityStudentsField } from "./ActivityStudentsField";
import { getPickerGroups } from "@/server/studentPicker";

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
    /** Copy this activity (the viewer's own): its details and students prefill the form. */
    from?: string;
  }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const sp = await searchParams;
  const { date, repeatUntil, from } = sp;

  // «Αντιγραφή»: only an activity the viewer created is copied.
  const viewer = await db.staffProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } });
  const source = from
    ? await db.activity.findFirst({
        where: { id: from, filerId: viewer?.id ?? "-" },
        select: {
          name: true,
          date: true,
          startPeriod: true,
          endPeriod: true,
          location: true,
          participants: { select: { studentId: true } },
        },
      })
    : null;
  const { name, startPeriod, endPeriod, location } = copyDefaults(source, sp);

  const todayStr = localDateStr();

  // Details are "confirmed" once they've been saved to the URL via the GET form
  const detailsConfirmed = !!(sp.name && date);

  // Weekly repeat preview: how many activities will be created.
  const occurrences = date ? weeklyOccurrences(date, normalizeIsoDate(repeatUntil)) : [];

  // Step 2: every active student by homegroup, and that day's tests that
  // overlap the activity's periods — each with the students it concerns, so
  // the picker can warn about the students actually chosen.
  const pickerGroups = detailsConfirmed ? await getPickerGroups() : [];
  let testConflicts: ActivityTestConflict[] = [];
  if (detailsConfirmed && date && startPeriod && endPeriod) {
    const actStart = Math.min(parseInt(startPeriod), parseInt(endPeriod));
    const actEnd = Math.max(parseInt(startPeriod), parseInt(endPeriod));
    const testsOnDate = await db.testSchedule.findMany({
      where: { date: utcMidnight(date) },
      include: {
        course: { select: { name: true } },
        group: { select: { name: true } },
        staff: { include: { user: { select: { name: true } } } },
      },
    });
    const overlapping = testsOnDate.filter((t) => t.period <= actEnd && t.period + t.periodCount - 1 >= actStart);
    if (overlapping.length > 0) {
      const groupIds = [...new Set(overlapping.map((t) => t.groupId))];
      const members = await db.studentProfile.findMany({
        where: {
          user: { isActive: true },
          OR: [{ groupId: { in: groupIds } }, { subjectGroups: { some: { groupId: { in: groupIds } } } }],
        },
        select: { id: true, groupId: true, subjectGroups: { select: { groupId: true } } },
      });
      testConflicts = overlapping.map((t) => ({
        id: t.id,
        courseName: t.course.name,
        groupName: t.group.name,
        staffName: t.staff?.scheduleName ?? t.staff?.user?.name ?? null,
        type: t.type,
        periodLabel: t.periodCount > 1 ? `P${t.period}–${t.period + t.periodCount - 1}` : `P${t.period}`,
        studentIds: members
          .filter((m) => m.groupId === t.groupId || m.subjectGroups.some((sg) => sg.groupId === t.groupId))
          .map((m) => m.id),
      }));
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
          {source && (
            <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Αντίγραφο της «{source.name}» ({fmtDisplayDate(source.date)}) με {source.participants.length}{" "}
              {source.participants.length === 1 ? "μαθητή/τρια" : "μαθητές"} — ελέγξτε την ημερομηνία.
            </p>
          )}
          <form method="GET" className="space-y-4">
            {source && <input type="hidden" name="from" value={from} />}
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
                  isIntercalary ? "Εμβόλιμη Περίοδος" :
                  dateSpecialDay.type === "HOMEGROUP_PERIOD" ? "Υπευθυνότητα Τμήματος" : dateSpecialDay.type;
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
            <ActivityStudentsField
              groups={pickerGroups}
              formId="create-activity-form"
              tests={testConflicts}
              initialSelected={source?.participants.map((p) => p.studentId)}
            />
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
