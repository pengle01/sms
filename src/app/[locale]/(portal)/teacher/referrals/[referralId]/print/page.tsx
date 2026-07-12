import { db } from "@/server/db";
import { staffDisplayName } from "@/lib/staffName";
import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY, totalPeriodsForDays } from "@/lib/schoolConfig";
import { PrintTrigger } from "./PrintTrigger";

const FULL_ACCESS_ROLES = ["SUPER_ADMIN", "HEADMASTER", "HEADTEACHER_A", "STUDENT_COUNSELOR"];

const ACTION_LABEL: Record<string, string> = {
  DETENTION: "Αποβολή",
  PEDAGOGICAL_DIALOGUE: "Παιδαγωγικός Διάλογος",
  WRITTEN_AGREEMENT: "Γραπτή Συμφωνία",
  WARNING: "Προειδοποίηση",
  OTHER: "Άλλο",
};

const REC_LABEL: Record<string, string> = {
  NO_RECOMMENDATION: "Καμία εισήγηση",
  EXPULSION: "Αποβολή",
  STRICT_MEASURE: "Αυστηρό παιδαγωγικό μέτρο",
  OBSERVATION: "Παρατήρηση",
  STRICT_OBSERVATION: "Αυστηρή παρατήρηση",
  NOTIFY_PARENTS: "Ενημέρωση γονέων",
  OTHER_RECOMMENDATION: "Άλλη εισήγηση",
};

function fmt(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function PrintResolutionPage({
  params,
}: {
  params: Promise<{ locale: string; referralId: string }>;
}) {
  const { locale, referralId } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const [referral, periodsPerDay] = await Promise.all([
    db.referral.findUnique({
      where: { id: referralId },
      include: {
        filer: { include: { user: { select: { name: true } } } },
        students: {
          include: {
            student: { include: { user: { select: { name: true } } } },
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
  ]);
  const periodsConfig = { ...DEFAULT_PERIODS_PER_DAY, ...periodsPerDay };

  function totalExpulsionPeriods(days: { date: Date }[]): number {
    return totalPeriodsForDays(periodsConfig, days.map((d) => d.date));
  }

  if (!referral) redirect(`/${locale}/teacher/referrals`);

  // Authorization: full-access roles, the filer, or a headteacher of one of the
  // referral's students' groups. Other staff may not read arbitrary referrals.
  let allowed = FULL_ACCESS_ROLES.includes(auth.role);
  if (!allowed) {
    const staff = await db.staffProfile.findUnique({
      where: { userId: auth.userId },
      include: { homeroomHeadGroups: { select: { id: true } } },
    });
    if (staff) {
      if (referral.filerId === staff.id) {
        allowed = true;
      } else {
        const headGroupIds = new Set(staff.homeroomHeadGroups.map((g) => g.id));
        allowed = referral.students.some((rs) => rs.groupId && headGroupIds.has(rs.groupId));
      }
    }
  }
  if (!allowed) redirect(`/${locale}/teacher/referrals`);

  const today = new Date().toLocaleDateString("el-GR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <>
      {/* Print trigger — client-only */}
      <PrintTrigger />

      {/* Document */}
      <div className="min-h-screen bg-white print:bg-white">
        {/* Screen-only controls */}
        <div className="print:hidden flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-slate-50">
          <a
            href={`/${locale}/teacher/referrals`}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Επιστροφή
          </a>
          <button
            onClick={() => window.print()}
            className="px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
          >
            Εκτύπωση
          </button>
        </div>

        {/* A4 content */}
        <div className="max-w-3xl mx-auto px-12 py-10 print:px-0 print:py-0 print:max-w-none">
          {/* Header */}
          <div className="text-center mb-8 pb-6 border-b-2 border-slate-800">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">
              Υπουργείο Παιδείας, Αθλητισμού και Νεολαίας
            </p>
            <h1 className="text-xl font-bold text-slate-900 mt-2">
              ΑΠOΦΑΣΗ ΠΕΙΘΑΡΧΙΚΟY ΜEΤΡΟΥ
            </h1>
            <p className="text-sm font-semibold text-slate-700 mt-1">Αρ. Καταγγελίας: #{referral.number}</p>
            <p className="text-xs text-slate-500 mt-1">Ημερομηνία έκδοσης: {today}</p>
          </div>

          {/* Referral info */}
          <section className="mb-6">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
              Στοιχεία Καταγγελίας
            </h2>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 font-medium text-slate-600 w-40">Καταγγέλλων</td>
                  <td className="py-1.5 text-slate-900">{staffDisplayName(referral.filer)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 font-medium text-slate-600">Ημερ. Παραπτώματος</td>
                  <td className="py-1.5 text-slate-900">{fmt(referral.date)}</td>
                </tr>
                {referral.location && (
                  <tr className="border-b border-slate-100">
                    <td className="py-1.5 font-medium text-slate-600">Τοποθεσία</td>
                    <td className="py-1.5 text-slate-900">{referral.location}</td>
                  </tr>
                )}
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 font-medium text-slate-600 align-top">Εισήγηση εκπαιδ.</td>
                  <td className="py-1.5 text-slate-900">{REC_LABEL[referral.recommendation] ?? referral.recommendation}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Description */}
          <section className="mb-6">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
              Περιγραφή Παραπτώματος
            </h2>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap border border-slate-200 rounded p-3 bg-slate-50">
              {referral.description}
            </p>
          </section>

          {/* Per-student resolutions */}
          <section className="mb-8">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
              Αποφάσεις ανά Μαθητή
            </h2>
            <div className="space-y-5">
              {referral.students.map((rs) => (
                <div key={rs.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2 flex items-center justify-between">
                    <span className="font-semibold text-slate-900 text-sm">
                      {rs.student.user?.name ?? "—"}
                    </span>
                    <span className="text-xs text-slate-500">{rs.group?.name}</span>
                  </div>
                  {rs.resolution ? (
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="px-4 py-1.5 font-medium text-slate-600 w-40">Ενέργεια</td>
                          <td className="px-4 py-1.5 text-slate-900 font-semibold">
                            {ACTION_LABEL[rs.resolution.action] ?? rs.resolution.action}
                          </td>
                        </tr>
                        {rs.resolution.actionDetails && (
                          <tr className="border-b border-slate-100">
                            <td className="px-4 py-1.5 font-medium text-slate-600 align-top">Περιγραφή ποινής</td>
                            <td className="px-4 py-1.5 text-slate-800">{rs.resolution.actionDetails}</td>
                          </tr>
                        )}
                        {rs.resolution.action === "DETENTION" && rs.resolution.expulsionDays.length > 0 && (
                          <tr className="border-b border-slate-100">
                            <td className="px-4 py-1.5 font-medium text-slate-600 align-top">Αποβολή</td>
                            <td className="px-4 py-1.5 text-slate-900">
                              <div className="space-y-0.5">
                                {rs.resolution.expulsionDays.map((d) => {
                                  const dow = d.date.getDay();
                                  const periods = dow >= 1 && dow <= 5 ? (periodsConfig[dow] ?? 7) : 0;
                                  return (
                                    <div key={d.id} className="flex items-center justify-between gap-4">
                                      <span>{fmt(d.date)}</span>
                                      <span className="text-slate-500 text-xs">{periods} περίοδοι</span>
                                    </div>
                                  );
                                })}
                                <div className="border-t border-slate-200 pt-1 flex items-center justify-between gap-4 font-semibold">
                                  <span>
                                    Σύνολο ({rs.resolution.expulsionDays.length} {rs.resolution.expulsionDays.length === 1 ? "ημέρα" : "ημέρες"})
                                  </span>
                                  <span>{totalExpulsionPeriods(rs.resolution.expulsionDays)} περίοδοι</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {rs.resolution.notes && (
                          <tr className="border-b border-slate-100">
                            <td className="px-4 py-1.5 font-medium text-slate-600 align-top">Σημειώσεις</td>
                            <td className="px-4 py-1.5 text-slate-800">{rs.resolution.notes}</td>
                          </tr>
                        )}
                        <tr className="border-b border-slate-100">
                          <td className="px-4 py-1.5 font-medium text-slate-600">Ημερ. Απόφασης</td>
                          <td className="px-4 py-1.5 text-slate-900">{fmt(rs.resolution.resolvedAt)}</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-1.5 font-medium text-slate-600">Αποφάσισε</td>
                          <td className="px-4 py-1.5 text-slate-900">{rs.resolution.resolvedBy?.name ?? "—"}</td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <p className="px-4 py-3 text-sm text-slate-400 italic">Εκκρεμής απόφαση</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Signatures */}
          <section className="mt-12 grid grid-cols-3 gap-8 text-center text-xs text-slate-600">
            <div>
              <div className="border-t border-slate-400 pt-2 mt-8">Ο/Η Καταγγέλλων</div>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-2 mt-8">Ο/Η Διευθυντής/ρια</div>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-2 mt-8">Γονέας / Κηδεμόνας</div>
            </div>
          </section>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 20mm; }
          body { background: white !important; }
        }
      `}</style>
    </>
  );
}
