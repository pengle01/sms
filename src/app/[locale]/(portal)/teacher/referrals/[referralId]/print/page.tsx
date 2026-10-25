import { db } from "@/server/db";
import { staffDisplayName, slotTeacherName } from "@/lib/staffName";
import { getSchoolName } from "@/lib/schoolConfig";
import { getSpecialDaysInRange, buildDayTypeMap, isHolidayType } from "@/lib/calendar";
import { missedLessons } from "@/lib/expulsionLessons";
import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canReadReferral } from "@/server/referralAccess";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY, totalPeriodsForDays } from "@/lib/schoolConfig";
import { PrintTrigger, PrintButton } from "./PrintTrigger";
import { expulsionDayPeriods, isPartialDay } from "@/lib/periods";
import { actionLabel, expulsionLength, lengthLabel, resolutionSummary } from "@/lib/referralLabels";

function fmt(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * The disciplinary decision (ΑΠΟΦΑΣΗ ΠΕΙΘΑΡΧΙΚΟΥ ΜΕΤΡΟΥ), one A4 per student:
 * name, homegroup and registry no., the incident, the decision and — for an
 * expulsion — its days and the lessons (subject + teacher) the student misses.
 * `?student=<referralStudentId>` prints just that student.
 */
export default async function PrintResolutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; referralId: string }>;
  searchParams: Promise<{ student?: string }>;
}) {
  const { locale, referralId } = await params;
  const { student: onlyStudent } = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const [referral, periodsPerDay, schoolName] = await Promise.all([
    db.referral.findUnique({
      where: { id: referralId },
      include: {
        filer: { include: { user: { select: { name: true } } } },
        students: {
          include: {
            student: {
              include: {
                user: { select: { name: true } },
                group: { select: { name: true } },
                subjectGroups: { select: { groupId: true } },
              },
            },
            group: { select: { name: true } },
            resolution: {
              include: {
                resolvedBy: { select: { name: true } },
                expulsionDays: { orderBy: { date: "asc" } },
              },
            },
          },
          orderBy: { student: { user: { name: "asc" } } },
        },
      },
    }),
    getPeriodsPerDay(),
    getSchoolName(),
  ]);
  const periodsConfig = { ...DEFAULT_PERIODS_PER_DAY, ...periodsPerDay };

  function totalExpulsionPeriods(days: { date: Date; fromPeriod: number | null; toPeriod: number | null }[]): number {
    return totalPeriodsForDays(periodsConfig, days);
  }

  if (!referral) redirect(`/${locale}/teacher/referrals`);

  // Authorization: full-access roles, the filer, or a headteacher of one of the
  // referral's students' groups. Other staff may not read arbitrary referrals.
  // Effective roles, so an admin-granted SUPER_ADMIN counts like a primary one.
  const allowed = await canReadReferral(auth, referral);
  if (!allowed) redirect(`/${locale}/teacher/referrals`);

  // Students to print: everyone, or the one picked with ?student=.
  const printed = onlyStudent ? referral.students.filter((rs) => rs.id === onlyStudent) : referral.students;
  const shown = printed.length > 0 ? printed : referral.students;

  // Missed lessons of each expelled student: their timetable (homegroup +
  // subject/support groups) on the expulsion weekdays, skipping holidays.
  const expelled = shown.filter((rs) => rs.resolution?.action === "DETENTION" && rs.resolution.expulsionDays.length > 0);
  const groupIdsOf = (rs: (typeof shown)[number]) =>
    [rs.student.groupId, ...rs.student.subjectGroups.map((g) => g.groupId)].filter((id): id is string => !!id);
  const allDates = expelled.flatMap((rs) => rs.resolution!.expulsionDays.map((d) => d.date));
  const [slots, specialDays] = await Promise.all([
    expelled.length
      ? db.timetableSlot.findMany({
          where: { groupId: { in: [...new Set(expelled.flatMap(groupIdsOf))] } },
          select: {
            groupId: true,
            dayOfWeek: true,
            period: true,
            staffName: true,
            course: { select: { name: true } },
            staff: { select: { scheduleName: true, user: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    allDates.length
      ? getSpecialDaysInRange(
          new Date(Math.min(...allDates.map((d) => d.getTime()))),
          new Date(Math.max(...allDates.map((d) => d.getTime()))),
        )
      : Promise.resolve(null),
  ]);
  const dayTypes = specialDays ? buildDayTypeMap(specialDays, allDates) : new Map();
  const noSchool = new Set([...dayTypes].filter(([, type]) => isHolidayType(type)).map(([iso]) => iso));
  const lessonsMissed = (rs: (typeof shown)[number]) => {
    const groups = new Set(groupIdsOf(rs));
    return missedLessons(
      slots
        .filter((s) => groups.has(s.groupId))
        .map((s) => ({ dayOfWeek: s.dayOfWeek, period: s.period, courseName: s.course.name, teacherName: slotTeacherName(s) })),
      // A partial day: only the lessons of its periods.
      rs.resolution!.expulsionDays,
      noSchool,
    );
  };

  const today = new Date().toLocaleDateString("el-GR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const section = "text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1";
  const label = "py-1.5 pr-4 font-medium text-slate-600 w-44 align-top";

  return (
    <>
      {/* Print trigger — client-only */}
      <PrintTrigger />

      <div className="min-h-screen bg-white print:bg-white">
        {/* Screen-only controls: back, which students, print */}
        <div className="print:hidden flex flex-wrap items-center gap-3 px-8 py-4 border-b border-slate-200 bg-slate-50">
          <a href={`/${locale}/teacher/referrals`} className="text-sm text-slate-500 hover:text-slate-800">
            ← Επιστροφή
          </a>
          {referral.students.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <a
                href="?"
                className={`px-2.5 py-1 rounded-md border ${printed.length === referral.students.length ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-white"}`}
              >
                Όλοι ({referral.students.length})
              </a>
              {referral.students.map((rs) => (
                <a
                  key={rs.id}
                  href={`?student=${rs.id}`}
                  className={`px-2.5 py-1 rounded-md border ${onlyStudent === rs.id ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-white"}`}
                >
                  {rs.student.user?.name ?? rs.student.studentId}
                </a>
              ))}
            </div>
          )}
          <div className="ml-auto">
            <PrintButton />
          </div>
        </div>

        {shown.map((rs) => {
          const res = rs.resolution;
          const isExpulsion = res?.action === "DETENTION" && res.expulsionDays.length > 0;
          const lessons = isExpulsion ? lessonsMissed(rs) : [];
          return (
            <div
              key={rs.id}
              className="decision-page max-w-3xl mx-auto px-12 py-10 print:px-0 print:py-0 print:max-w-none"
            >
              {/* Header */}
              <div className="text-center mb-6 pb-5 border-b-2 border-slate-800">
                {schoolName && <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">{schoolName}</p>}
                <h1 className="text-xl font-bold text-slate-900 mt-2">ΑΠΟΦΑΣΗ ΠΕΙΘΑΡΧΙΚΟΥ ΜΕΤΡΟΥ</h1>
                <p className="text-sm font-semibold text-slate-700 mt-1">Αρ. Καταγγελίας: #{referral.number}</p>
                <p className="text-xs text-slate-500 mt-1">Ημερομηνία έκδοσης: {today}</p>
              </div>

              {/* Student */}
              <section className="mb-6">
                <h2 className={section}>Στοιχεία Μαθητή/τριας</h2>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className={label}>Ονοματεπώνυμο</td>
                      <td className="py-1.5 text-slate-900 font-semibold">{rs.student.user?.name ?? "—"}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className={label}>Τμήμα</td>
                      <td className="py-1.5 text-slate-900">{rs.group?.name ?? rs.student.group?.name ?? "—"}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className={label}>Αρ. Μητρώου</td>
                      <td className="py-1.5 text-slate-900 font-mono">{rs.student.studentId}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Referral info */}
              <section className="mb-6">
                <h2 className={section}>Στοιχεία Καταγγελίας</h2>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className={label}>Καταγγέλλων</td>
                      <td className="py-1.5 text-slate-900">{staffDisplayName(referral.filer)}</td>
                    </tr>
                    {referral.title && (
                      <tr className="border-b border-slate-100">
                        <td className={label}>Παράπτωμα</td>
                        <td className="py-1.5 text-slate-900 font-semibold">{referral.title}</td>
                      </tr>
                    )}
                    <tr className="border-b border-slate-100">
                      <td className={label}>Ημερ. Παραπτώματος</td>
                      <td className="py-1.5 text-slate-900">{fmt(referral.date)}</td>
                    </tr>
                    {referral.location && (
                      <tr className="border-b border-slate-100">
                        <td className={label}>Τοποθεσία</td>
                        <td className="py-1.5 text-slate-900">{referral.location}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="mt-3 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap border border-slate-200 rounded p-3 bg-slate-50">
                  {referral.description}
                </p>
              </section>

              {/* Decision */}
              <section className="mb-6">
                <h2 className={section}>Απόφαση</h2>
                {res ? (
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className={label}>Μέτρο</td>
                        <td className="py-1.5 text-slate-900 font-semibold">
                          {/* A suspended expulsion shows its length: «Αποβολή με Αναστολή · 2 ημέρες» */}
                          {res.action === "SUSPENDED_EXPULSION" ? resolutionSummary(res) : actionLabel(res.action)}
                        </td>
                      </tr>
                      {res.actionDetails && (
                        <tr className="border-b border-slate-100">
                          <td className={label}>Περιγραφή ποινής</td>
                          <td className="py-1.5 text-slate-800">{res.actionDetails}</td>
                        </tr>
                      )}
                      {isExpulsion && (
                        <tr className="border-b border-slate-100">
                          <td className={label}>Ημέρες αποβολής</td>
                          <td className="py-1.5 text-slate-900">
                            <div className="space-y-0.5">
                              {res.expulsionDays.map((d) => {
                                const periods = expulsionDayPeriods(periodsConfig, d);
                                return (
                                  <div key={d.id} className="flex items-center justify-between gap-4">
                                    <span>{fmt(d.date)}</span>
                                    <span className="text-slate-500 text-xs">
                                      {isPartialDay(d) ? `Περίοδοι ${d.fromPeriod}–${d.toPeriod}` : "Όλη η μέρα"} · {periods} περίοδοι
                                    </span>
                                  </div>
                                );
                              })}
                              <div className="border-t border-slate-200 pt-1 flex items-center justify-between gap-4 font-semibold">
                                <span>
                                  Σύνολο ({(() => {
                                    const l = expulsionLength(res.expulsionDays);
                                    return lengthLabel(l.days, l.periods);
                                  })()})
                                </span>
                                <span>{totalExpulsionPeriods(res.expulsionDays)} περίοδοι</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {res.notes && (
                        <tr className="border-b border-slate-100">
                          <td className={label}>Σημειώσεις</td>
                          <td className="py-1.5 text-slate-800">{res.notes}</td>
                        </tr>
                      )}
                      <tr className="border-b border-slate-100">
                        <td className={label}>Ημερ. Απόφασης</td>
                        <td className="py-1.5 text-slate-900">{fmt(res.resolvedAt)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-400 italic">Εκκρεμής απόφαση</p>
                )}
              </section>

              {/* Lessons missed during the expulsion */}
              {isExpulsion && (
                <section className="mb-6">
                  <h2 className={section}>Μαθήματα που θα χάσει</h2>
                  {lessons.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">Δεν βρέθηκαν μαθήματα στο ωρολόγιο για αυτές τις ημέρες.</p>
                  ) : (
                    <table className="w-full text-sm border border-slate-200">
                      <thead>
                        <tr className="bg-slate-100 text-left">
                          <th className="px-3 py-1.5 font-semibold text-slate-700">Μάθημα</th>
                          <th className="px-3 py-1.5 font-semibold text-slate-700">Καθηγητής/τρια</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lessons.map((l) => (
                          <tr key={`${l.courseName}|${l.teacherName}`} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-slate-900">{l.courseName}</td>
                            <td className="px-3 py-1.5 text-slate-700">{l.teacherName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {/* Signatures — the measure is signed by the headteacher who decided it */}
              <section className="mt-12 grid grid-cols-3 gap-8 text-center text-xs text-slate-600">
                <div>
                  <div className="border-t border-slate-400 pt-2 mt-8">
                    Ο/Η Βοηθός Διευθυντής/ντρια
                    {res?.resolvedBy?.name && (
                      <div className="mt-0.5 font-medium text-slate-800">{res.resolvedBy.name}</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-2 mt-8">Ο/Η Διευθυντής/ντρια</div>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-2 mt-8">Γονέας / Κηδεμόνας</div>
                </div>
              </section>
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 20mm; }
          body { background: white !important; }
          /* The portal frame scrolls at a fixed height — let it grow so every page prints. */
          .h-screen { height: auto !important; }
          .overflow-hidden, .overflow-y-auto { overflow: visible !important; }
          .decision-page { break-after: page; }
          .decision-page:last-child { break-after: auto; }
        }
      `}</style>
    </>
  );
}
