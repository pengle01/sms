import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSchoolName } from "@/lib/schoolConfig";
import { fmtDisplayDate, getNow } from "@/lib/dates";
import { safeBack } from "@/lib/timetablePrint";
import { groupListAccess, loadGroupDetail } from "@/server/groupList";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

/**
 * A4 list of one group's students — homegroup, lesson/elective or support
 * group — with registry number and, for non-homegroups, each student's
 * homegroup. Opened from «Πού βρίσκεται» → «Τμήματα»; same access (groupListAccess).
 */
export default async function GroupListPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ id?: string; back?: string }>;
}) {
  const { locale } = await params;
  const { id, back } = await searchParams;
  const canSee = await groupListAccess();
  if (!canSee) redirect(`/${locale}/login/staff`);
  if (!id) notFound();

  const [detail, schoolName, t] = await Promise.all([
    loadGroupDetail(id),
    getSchoolName(),
    getTranslations("whereabouts"),
  ]);
  if (!detail || !canSee(detail.kind)) notFound();
  const showHomegroup = detail.kind !== "homegroup";

  return (
    <>
      <PrintBar backHref={safeBack(back, locale) ?? `/${locale}`} />

      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-12 py-10 print:px-0 print:py-0 print:max-w-none text-sm text-black">
          <div className="mb-4 pb-3 border-b-2 border-black">
            {schoolName && <p className="text-xs uppercase tracking-widest text-slate-500">{schoolName}</p>}
            <h1 className="text-lg font-bold mt-1">ΚΑΤΑΛΟΓΟΣ ΜΑΘΗΤΩΝ</h1>
            <p className="text-base font-semibold">
              {detail.name} <span className="font-normal">· {t(`groupKind_${detail.kind}`)}</span>
            </p>
            {detail.lessons.length > 0 && <p className="text-xs text-slate-700 mt-0.5">{detail.lessons.join(" · ")}</p>}
            <p className="text-xs text-slate-600 mt-0.5">{fmtDisplayDate(getNow())}</p>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                <th className="border border-black px-2 py-1 w-10 text-right">#</th>
                <th className="border border-black px-2 py-1 w-28">Αρ. Μητρώου</th>
                <th className="border border-black px-2 py-1">Ονοματεπώνυμο</th>
                {showHomegroup && <th className="border border-black px-2 py-1 w-24">Τμήμα</th>}
              </tr>
            </thead>
            <tbody>
              {detail.students.map((s, idx) => (
                <tr key={s.id} className={idx % 2 === 1 ? "bg-gray-200 break-inside-avoid" : "break-inside-avoid"}>
                  <td className="border border-black px-2 py-1 text-right tabular-nums">{idx + 1}</td>
                  <td className="border border-black px-2 py-1 tabular-nums">{s.studentId}</td>
                  <td className="border border-black px-2 py-1">{s.name}</td>
                  {showHomegroup && <td className="border border-black px-2 py-1">{s.homegroup ?? ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2">Σύνολο: {detail.students.length}</p>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
          main { padding: 0 !important; }
          /* Keep the alternate-row shading — browsers drop backgrounds by default. */
          tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
