import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveAuth } from "@/server/authz";
import { getSchoolName } from "@/lib/schoolConfig";
import { fmtDisplayDate, getNow } from "@/lib/dates";
import {
  behaviorWindowSince,
  groupsForStaff,
  loadGroupBehavior,
  parseBehaviorWindow,
  type BehaviorTotals,
} from "@/server/behaviorReport";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

const COLUMNS: { key: keyof BehaviorTotals; label: string }[] = [
  { key: "absences", label: "colAbsences" },
  { key: "partialDays", label: "colPartial" },
  { key: "lates", label: "colLates" },
  { key: "referrals", label: "colReferrals" },
  { key: "toilet", label: "colToilet" },
  { key: "lowGrades", label: "colLowGrades" },
];

/**
 * «Τμήμα μου» on A4: the roster table (absences, partial days, lates,
 * referrals, toilet, low grades) for the chosen window — one homegroup
 * (`groupId`) or, with `all=1`, one page per homegroup of the viewer.
 */
export default async function HomegroupPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; window?: string; all?: string }>;
}) {
  const { locale } = await params;
  const { groupId, window: windowParam, all } = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const groups = await groupsForStaff(auth.userId);
  const windowKey = parseBehaviorWindow(windowParam);
  const backHref = `/${locale}/teacher/homegroup?window=${windowKey}${groupId ? `&groupId=${groupId}` : ""}`;
  // Only the viewer's own homegroups — any other id prints nothing.
  const printed = all === "1" ? groups : groups.filter((g) => g.id === (groupId ?? groups[0]?.id));
  if (printed.length === 0) redirect(backHref);

  const since = await behaviorWindowSince(windowKey);
  const [t, schoolName, reports] = await Promise.all([
    getTranslations("investigate"),
    getSchoolName(),
    Promise.all(printed.map((g) => loadGroupBehavior(g.id, since))),
  ]);
  const windowLabel = windowKey === "30" ? t("windowDays", { days: 30 }) : windowKey === "term" ? t("windowTerm") : t("windowYear");
  const today = getNow();

  return (
    <>
      <PrintBar backHref={backHref} />

      {printed.map((g, gi) => {
        const { students } = reports[gi]!;
        const total = (key: keyof BehaviorTotals) => students.reduce((sum, s) => sum + s.totals[key], 0);
        return (
          <div key={g.id} className="roster-page bg-white">
            <div className="max-w-4xl mx-auto px-10 py-8 print:px-0 print:py-0 print:max-w-none text-sm text-black">
              <div className="mb-4 pb-3 border-b-2 border-black">
                {schoolName && <p className="text-xs uppercase tracking-widest text-slate-500">{schoolName}</p>}
                <h1 className="text-lg font-bold mt-1">
                  {t("printTitle")} — {g.name}
                </h1>
                <p className="text-xs text-slate-700 mt-0.5">
                  {t("printPeriod", { window: windowLabel, from: fmtDisplayDate(since), to: fmtDisplayDate(today) })}
                </p>
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="border border-black px-2 py-1 w-8 text-right">#</th>
                    <th className="border border-black px-2 py-1 w-24">{t("colRegistry")}</th>
                    <th className="border border-black px-2 py-1">{t("colStudent")}</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="border border-black px-1.5 py-1 w-16 text-center text-xs leading-tight">
                        {t(c.label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, idx) => (
                    <tr key={s.studentProfileId} className={idx % 2 === 1 ? "bg-gray-200 break-inside-avoid" : "break-inside-avoid"}>
                      <td className="border border-black px-2 py-1 text-right tabular-nums">{idx + 1}</td>
                      <td className="border border-black px-2 py-1 tabular-nums">{s.studentId}</td>
                      <td className="border border-black px-2 py-1">{s.studentName}</td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="border border-black px-1.5 py-1 text-center tabular-nums">
                          {s.totals[c.key] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={3 + COLUMNS.length} className="border border-black px-2 py-4 text-center">
                        {t("noStudents")}
                      </td>
                    </tr>
                  )}
                </tbody>
                {students.length > 0 && (
                  <tfoot>
                    <tr className="font-bold">
                      <td colSpan={3} className="border border-black px-2 py-1 text-right">
                        {t("printTotal", { count: students.length })}
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="border border-black px-1.5 py-1 text-center tabular-nums">
                          {total(c.key)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
              <p className="mt-2 text-xs text-slate-600">{t("printAbsencesNote")}</p>
            </div>
          </div>
        );
      })}

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; }
          .h-screen { height: auto !important; }
          .overflow-hidden, .overflow-y-auto { overflow: visible !important; }
          main { padding: 0 !important; }
          .roster-page { break-after: page; }
          .roster-page:last-child { break-after: auto; }
          /* Keep the alternate-row shading — browsers drop backgrounds by default. */
          tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
