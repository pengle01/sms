import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import { staffDisplayName } from "@/lib/staffName";
import { getSchoolName } from "@/lib/schoolConfig";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

// A4 list of an activity's students (with registry number and homegroup).
// Same audience as the activity page itself.
export default async function PrintActivityPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const [activity, schoolName] = await Promise.all([
    db.activity.findUnique({
      where: { id },
      include: {
        filer: { select: { scheduleName: true, user: { select: { name: true } } } },
        participants: {
          include: {
            student: {
              select: { studentId: true, user: { select: { name: true } }, group: { select: { name: true } } },
            },
          },
          orderBy: { student: { user: { name: "asc" } } },
        },
      },
    }),
    getSchoolName(),
  ]);
  if (!activity) notFound();

  // Official print: full year.
  const dateLabel = activity.date.toLocaleDateString("el-GR", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  });
  const periods =
    activity.startPeriod === activity.endPeriod
      ? `Περίοδος ${activity.startPeriod}`
      : `Περίοδοι ${activity.startPeriod}–${activity.endPeriod}`;

  return (
    <>
      <PrintBar backHref={`/${locale}/teacher/activities/${id}`} />

      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-12 py-10 print:px-0 print:py-0 print:max-w-none text-sm text-black">
          <div className="mb-4 pb-3 border-b-2 border-black">
            {schoolName && <p className="text-xs uppercase tracking-widest text-slate-500">{schoolName}</p>}
            <h1 className="text-lg font-bold mt-1">ΚΑΤΑΛΟΓΟΣ ΜΑΘΗΤΩΝ ΔΡΑΣΤΗΡΙΟΤΗΤΑΣ</h1>
            <p className="text-base font-semibold">{activity.name}</p>
            <p className="mt-0.5">
              {[dateLabel, periods, activity.location].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">Διοργάνωση: {staffDisplayName(activity.filer)}</p>
          </div>

          {activity.participants.length === 0 ? (
            <p className="text-slate-500">Δεν υπάρχουν μαθητές/τριες σε αυτή τη δραστηριότητα.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="border border-black px-2 py-1 w-10 text-right">#</th>
                  <th className="border border-black px-2 py-1 w-28">Αρ. Μητρώου</th>
                  <th className="border border-black px-2 py-1">Ονοματεπώνυμο</th>
                  <th className="border border-black px-2 py-1 w-24">Τμήμα</th>
                </tr>
              </thead>
              <tbody>
                {activity.participants.map((p, idx) => (
                  <tr key={p.id} className={idx % 2 === 1 ? "bg-gray-200 break-inside-avoid" : "break-inside-avoid"}>
                    <td className="border border-black px-2 py-1 text-right tabular-nums">{idx + 1}</td>
                    <td className="border border-black px-2 py-1 tabular-nums">{p.student.studentId}</td>
                    <td className="border border-black px-2 py-1">{p.student.user?.name}</td>
                    <td className="border border-black px-2 py-1">{p.student.group?.name ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2">Σύνολο: {activity.participants.length}</p>
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
