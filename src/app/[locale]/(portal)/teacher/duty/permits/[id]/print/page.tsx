import { db } from "@/server/db";
import { redirect, notFound } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { getSchoolName } from "@/lib/schoolConfig";
import { staffDisplayName } from "@/lib/staffName";
import { permitContactLabel } from "@/lib/exitPermit";
import { PrintBar } from "./PrintBar";

export default async function PrintExitPermitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { locale, id } = await params;
  const { back } = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  // The paper travels to the current teacher — any educator may view it;
  // the super admin reaches it from the admin permits log.
  if (!isEducator(auth.role) && !auth.roles.includes("SUPER_ADMIN")) {
    redirect(`/${locale}/login`);
  }

  const [permit, schoolName] = await Promise.all([
    db.exitPermit.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            group: { select: { name: true } },
          },
        },
        issuer: { include: { user: { select: { name: true } } } },
        smsContact: { select: { name: true, role: true, phone: true } },
      },
    }),
    getSchoolName(),
  ]);
  if (!permit) notFound();

  const dateLabel = permit.date.toLocaleDateString("el-GR", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const timeLabel = permit.issuedAt.toLocaleTimeString("el-GR", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia",
  });

  const row = (label: string, value: React.ReactNode) => (
    <tr className="border-b border-slate-100">
      <td className="py-2 font-medium text-slate-600 w-44">{label}</td>
      <td className="py-2 text-slate-900">{value ?? "—"}</td>
    </tr>
  );

  return (
    <>
      <PrintBar backHref={`/${locale}/teacher/duty${back ? `?${back}` : ""}`} />

      <div className="min-h-screen bg-white print:bg-white">
        <div className="max-w-xl mx-auto px-10 py-10 print:px-0 print:py-0 print:max-w-none relative">
          {/* Header */}
          <div className="text-center mb-6 pb-4 border-b-2 border-slate-800">
            {schoolName && (
              <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">{schoolName}</p>
            )}
            <h1 className="text-xl font-bold text-slate-900 mt-1">ΑΔΕΙΑ ΕΞΟΔΟΥ</h1>
            <p className="text-xs text-slate-500 mt-1">{dateLabel} · ώρα έκδοσης {timeLabel}</p>
          </div>

          {/* Details */}
          <table className="w-full text-sm mb-6">
            <tbody>
              {row("Μαθητής/τρια", permit.student.user?.name)}
              {row("Τμήμα", permit.student.group?.name)}
              {row("Αρ. Μητρώου", <span className="font-mono">{permit.student.studentId}</span>)}
              {row(
                "Αποχώρηση",
                <span className="font-semibold">
                  από την {permit.fromPeriod}η περίοδο έως το τέλος της ημέρας
                </span>
              )}
              {row("Λόγος", permit.reason)}
              {row("Επικοινωνία με γονέα", permitContactLabel(permit.smsContact, permit.contactNote))}
              {row("Εξέδωσε", staffDisplayName(permit.issuer))}
            </tbody>
          </table>

          {/* Handover note */}
          <p className="text-xs text-slate-500 border border-slate-200 rounded p-3 bg-slate-50 mb-10">
            Η παρούσα άδεια εκδόθηκε από τον/την εφημερεύοντα/ουσα βοηθό μετά από
            τηλεφωνική συνεννόηση με τον γονέα/κηδεμόνα. Παραδίδεται στον/στην
            διδάσκοντα/ουσα της τρέχουσας περιόδου. Ο/Η μαθητής/τρια σημειώνεται
            απών/ούσα· η απουσία συνδέεται με την άδεια εξόδου.
          </p>

          {/* Signatures */}
          <section className="grid grid-cols-2 gap-10 text-center text-xs text-slate-600">
            <div>
              <div className="border-t border-slate-400 pt-2 mt-8">Ο/Η Εφημερεύων/ουσα Βοηθός</div>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-2 mt-8">Ο/Η Διδάσκων/ουσα</div>
            </div>
          </section>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A5; margin: 15mm; }
          body { background: white !important; }
        }
      `}</style>
    </>
  );
}
