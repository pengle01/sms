import { db } from "@/server/db";
import { redirect, notFound } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { getSchoolName } from "@/lib/schoolConfig";
import { staffDisplayName } from "@/lib/staffName";
import { utcMidnight } from "@/lib/dates";
import { PrintBar } from "./PrintBar";

// The posted daily substitution sheet (A4). Any educator may view/print it.
export default async function PrintSubstitutionPlanPage({
  params,
}: {
  params: Promise<{ locale: string; date: string }>;
}) {
  const { locale, date: dateStr } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  if (!isEducator(auth.role) && !auth.roles.includes("SUPER_ADMIN")) {
    redirect(`/${locale}/login`);
  }

  const date = utcMidnight(dateStr);
  if (isNaN(date.getTime())) notFound();

  const [plan, schoolName, requests] = await Promise.all([
    db.substitutionPlan.findUnique({
      where: { date },
      include: {
        entries: {
          include: {
            group: { select: { name: true } },
            absentStaff: { select: { scheduleName: true, user: { select: { name: true } } } },
            substituteStaff: { select: { scheduleName: true, user: { select: { name: true } } } },
            timetableSlot: { include: { course: { select: { name: true } } } },
          },
          orderBy: [{ period: "asc" }],
        },
      },
    }),
    getSchoolName(),
    db.substitutionRequest.findMany({
      where: {
        type: "ABSENCE",
        OR: [
          { startDate: date },
          { AND: [{ startDate: { lte: date } }, { endDate: { gte: date } }] },
        ],
      },
      include: { staff: { select: { scheduleName: true, user: { select: { name: true } } } } },
    }),
  ]);
  if (!plan) notFound();

  const entries = plan.entries;
  const covers = entries.filter((e) => e.kind === "COVER" || e.kind === "SWAP");
  const studyHalls = entries.filter((e) => e.kind === "STUDY_HALL");
  const releases = entries.filter((e) => e.kind === "RELEASE");
  const roomChanges = entries.filter((e) => e.kind === "ROOM_CHANGE");
  const supportMerges = entries.filter((e) => e.kind === "SUPPORT_MERGE");

  const dateLabel = date.toLocaleDateString("el-GR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  });

  const section = (title: string, head: string[], rows: React.ReactNode) => (
    <section className="mb-6">
      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">
        {title}
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {head.map((h) => (
              <th key={h} className="text-left py-1 pr-3 text-xs font-semibold text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </section>
  );

  return (
    <>
      <PrintBar backHref={`/${locale}/teacher/substitutions/plan?date=${dateStr}`} />

      <div className="min-h-screen bg-white print:bg-white">
        <div className="max-w-3xl mx-auto px-12 py-10 print:px-0 print:py-0 print:max-w-none">
          <div className="text-center mb-6 pb-4 border-b-2 border-slate-800">
            {schoolName && (
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">{schoolName}</p>
            )}
            <h1 className="text-xl font-bold text-slate-900 mt-1">ΗΜΕΡΗΣΙΟ ΔΕΛΤΙΟ ΑΝΑΠΛΗΡΩΣΕΩΝ</h1>
            <p className="text-sm text-slate-600 mt-1">{dateLabel}</p>
            {plan.status !== "FINAL" && (
              <p className="text-xs font-bold text-amber-600 mt-1">ΠΡΟΧΕΙΡΟ — ΔΕΝ ΕΧΕΙ ΟΡΙΣΤΙΚΟΠΟΙΗΘΕΙ</p>
            )}
          </div>

          {covers.length > 0 &&
            section(
              "Α. Αναπληρώσεις",
              ["Περ.", "Τμήμα", "Απών/ούσα", "Αναπληρωτής/τρια", "Αίθουσα"],
              covers.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-semibold">Π{e.period}</td>
                  <td className="py-1.5 pr-3">{e.group?.name}</td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {e.absentStaff ? staffDisplayName(e.absentStaff) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 font-medium">
                    {e.substituteStaff ? staffDisplayName(e.substituteStaff) : "—"}
                    {e.note && <span className="block text-xs text-slate-500">{e.note}</span>}
                  </td>
                  <td className="py-1.5">{e.newRoom ?? e.room ?? ""}</td>
                </tr>
              ))
            )}

          {studyHalls.length > 0 &&
            section(
              "Φ/δι εφημερεύοντος ΒΔ",
              ["Περ.", "Τμήμα", "Απών/ούσα", "Χώρος"],
              studyHalls.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-semibold">Π{e.period}</td>
                  <td className="py-1.5 pr-3">{e.group?.name}</td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {e.absentStaff ? staffDisplayName(e.absentStaff) : "—"}
                  </td>
                  <td className="py-1.5">{e.newRoom ?? "κιόσκια"}</td>
                </tr>
              ))
            )}

          {releases.length > 0 &&
            section(
              "Β. Τμήματα που αποχωρούν (τελευταία περίοδος)",
              ["Περ.", "Τμήμα", "Σημείωση"],
              releases.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-semibold">Π{e.period}</td>
                  <td className="py-1.5 pr-3">{e.group?.name}</td>
                  <td className="py-1.5 text-slate-600">{e.note}</td>
                </tr>
              ))
            )}

          {roomChanges.length > 0 &&
            section(
              "Γ. Αλλαγές αίθουσας",
              ["Περ.", "Τμήμα", "Εκπαιδευτικός", "Νέα αίθουσα"],
              roomChanges.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-semibold">Π{e.period}</td>
                  <td className="py-1.5 pr-3">{e.group?.name ?? ""}</td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {e.substituteStaff ? staffDisplayName(e.substituteStaff) : e.absentStaff ? staffDisplayName(e.absentStaff) : "—"}
                    {e.note && <span className="block text-xs text-slate-500">{e.note}</span>}
                  </td>
                  <td className="py-1.5 font-medium">{e.newRoom ?? ""}</td>
                </tr>
              ))
            )}

          {supportMerges.length > 0 &&
            section(
              "Στήριξη",
              ["Περ.", "Τμήμα", "Σημείωση"],
              supportMerges.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-semibold">Π{e.period}</td>
                  <td className="py-1.5 pr-3">{e.group?.name}</td>
                  <td className="py-1.5 text-slate-600">{e.note}</td>
                </tr>
              ))
            )}

          {requests.length > 0 &&
            section(
              "Δ. Απουσίες εκπαιδευτικών",
              ["Εκπαιδευτικός", "Λόγος"],
              requests.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-medium">{staffDisplayName(r.staff)}</td>
                  <td className="py-1.5 text-slate-600">
                    {r.reason}
                    {r.reasonDetails && ` — ${r.reasonDetails}`}
                    {r.periods.length > 0 && ` (Π: ${r.periods.join(", ")})`}
                  </td>
                </tr>
              ))
            )}

          <section className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-slate-600">
            <div><div className="border-t border-slate-400 pt-2 mt-8">Ο/Η Συντονιστής/ρια Αναπληρώσεων</div></div>
            <div><div className="border-t border-slate-400 pt-2 mt-8">Ο/Η Διευθυντής/ρια</div></div>
          </section>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
        }
      `}</style>
    </>
  );
}
