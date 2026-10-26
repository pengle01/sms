import { redirect, notFound } from "next/navigation";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { canReadReferral } from "@/server/referralAccess";
import { letterPunishment, letterOffence, parentLines, letterDate } from "@/lib/referralLetter";
import { getSchoolName } from "@/lib/schoolConfig";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

/**
 * «ΓΡΑΠΤΗ ΕΝΗΜΕΡΩΣΗ ΓΟΝΕΩΝ/ΚΗΔΕΜΟΝΩΝ ΓΙΑ ΕΠΙΒΟΛΗ ΠΑΙΔΑΓΩΓΙΚΩΝ ΜΕΤΡΩΝ» — one A4
 * per resolved student of the referral (`?student=` for just one): the
 * measure in its own section (days and periods for an expulsion), signed by
 * the deputy who decided it, with the parent's acknowledgement slip.
 */
export default async function ReferralParentLetterPage({
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

  const [referral, schoolName] = await Promise.all([
    db.referral.findUnique({
      where: { id: referralId },
      select: {
        filerId: true,
        title: true,
        description: true,
        students: {
          where: { status: "RESOLVED" },
          orderBy: { student: { user: { name: "asc" } } },
          select: {
            id: true,
            groupId: true,
            group: { select: { name: true } },
            student: {
              select: {
                address: true,
                user: { select: { name: true } },
                group: { select: { name: true } },
                smsContacts: { select: { role: true, name: true, phone: true } },
              },
            },
            resolution: {
              select: {
                action: true,
                actionDetails: true,
                resolvedAt: true,
                suspendedDays: true,
                suspendedPeriods: true,
                expulsionDays: { select: { date: true, fromPeriod: true, toPeriod: true }, orderBy: { date: "asc" } },
                resolvedBy: { select: { name: true, staffProfile: { select: { scheduleName: true } } } },
              },
            },
          },
        },
      },
    }),
    getSchoolName(),
  ]);
  if (!referral) notFound();
  if (!(await canReadReferral(auth, referral))) redirect(`/${locale}/teacher/referrals`);

  const picked = onlyStudent ? referral.students.filter((rs) => rs.id === onlyStudent) : referral.students;
  const shown = picked.length > 0 ? picked : referral.students;
  const offence = letterOffence(referral.title, referral.description);

  return (
    <>
      <PrintBar backHref={`/${locale}/teacher/referrals`} />

      {referral.students.length > 1 && (
        <div className="print:hidden flex flex-wrap items-center gap-1.5 px-8 py-3 border-b border-slate-200 bg-slate-50 text-xs">
          <a
            href="?"
            className={`px-2.5 py-1 rounded-md border ${!onlyStudent ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-white"}`}
          >
            Όλοι ({referral.students.length})
          </a>
          {referral.students.map((rs) => (
            <a
              key={rs.id}
              href={`?student=${rs.id}`}
              className={`px-2.5 py-1 rounded-md border ${onlyStudent === rs.id ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-white"}`}
            >
              {rs.student.user?.name ?? "—"}
            </a>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500">Δεν υπάρχει ακόμη απόφαση για κανέναν/καμία μαθητή/τρια.</p>
      ) : (
        shown.map((rs) => {
          const res = rs.resolution!;
          const m = letterPunishment(res);
          const parents = parentLines(rs.student.smsContacts);
          const signer = res.resolvedBy?.staffProfile?.scheduleName ?? res.resolvedBy?.name ?? "";
          const label = "py-1.5 pr-4 align-top text-[12px] font-semibold uppercase tracking-wide text-slate-500 w-36";
          return (
            <div key={rs.id} className="letter-page bg-white text-black">
              <div className="mx-auto max-w-3xl px-12 py-10 print:max-w-none print:px-0 print:py-0 text-[13px] leading-relaxed">
                {/* Letterhead */}
                <header className="text-center pb-4 mb-6 border-b-2 border-slate-800">
                  {schoolName && <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{schoolName}</p>}
                  <h1 className="mt-2 text-[15px] font-bold tracking-wide">
                    ΓΡΑΠΤΗ ΕΝΗΜΕΡΩΣΗ ΓΟΝΕΩΝ/ΚΗΔΕΜΟΝΩΝ
                    <span className="block text-[13px] font-semibold text-slate-700">ΓΙΑ ΕΠΙΒΟΛΗ ΠΑΙΔΑΓΩΓΙΚΩΝ ΜΕΤΡΩΝ</span>
                  </h1>
                </header>

                {/* Addressee */}
                <section className="grid grid-cols-[1fr_auto] gap-x-8">
                  <div>
                    <p className="text-slate-600">Προς το γονέα/κηδεμόνα του/της μαθητή/τριας:</p>
                    <p className="mt-1 text-[15px] font-bold">{rs.student.user?.name ?? "—"}</p>
                    <div className="mt-1 text-slate-700">
                      {rs.student.address && <p>{rs.student.address}</p>}
                      {parents.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-600">Τμήμα</p>
                    <p className="mt-1 text-[15px] font-bold">{rs.group?.name ?? rs.student.group?.name ?? "—"}</p>
                    <p className="mt-3 text-slate-600">{letterDate(res.resolvedAt)}</p>
                  </div>
                </section>

                <p className="mt-6">
                  Με το σημείωμα αυτό σας πληροφορώ ότι, για το πιο κάτω παράπτωμα, επιβλήθηκε στο παιδί σας το
                  ακόλουθο παιδαγωγικό μέτρο:
                </p>

                {/* The offence */}
                <section className="mt-4">
                  <h2 className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Παράπτωμα</h2>
                  <p className="mt-1 font-semibold whitespace-pre-wrap">{offence}</p>
                </section>

                {/* The punishment — its own clearly framed section */}
                <section className="mt-5 rounded-lg border-2 border-slate-800 overflow-hidden">
                  <h2 className="bg-slate-800 text-white px-4 py-1.5 text-[12px] font-bold uppercase tracking-widest print-bg">
                    Παιδαγωγικό μέτρο
                  </h2>
                  <div className="px-4 py-2">
                  <table className="w-full">
                    <tbody>
                      <tr>
                        <td className={label}>Μέτρο</td>
                        <td className="py-1.5 text-[15px] font-bold">{m.measure}</td>
                      </tr>
                      {m.length && (
                        <tr className="border-t border-slate-200">
                          <td className={label}>Διάρκεια</td>
                          <td className="py-1.5 font-semibold">{m.length}</td>
                        </tr>
                      )}
                      {m.days.length > 0 && (
                        <tr className="border-t border-slate-200">
                          <td className={label}>Ημέρες</td>
                          <td className="py-1.5">
                            {m.days.map((d) => (
                              <p key={d.date} className="flex justify-between gap-6">
                                <span className="font-semibold">{d.date}</span>
                                <span className="text-slate-700">{d.span}</span>
                              </p>
                            ))}
                          </td>
                        </tr>
                      )}
                      {m.where && (
                        <tr className="border-t border-slate-200">
                          <td className={label}>Χώρος</td>
                          <td className="py-1.5">
                            Για τη διάρκεια του μέτρου ο/η μαθητής/τρια θα βρίσκεται στο{" "}
                            <strong className="underline underline-offset-2">{m.where}</strong>
                          </td>
                        </tr>
                      )}
                      {m.details && (
                        <tr className="border-t border-slate-200">
                          <td className={label}>Περιγραφή</td>
                          <td className="py-1.5 whitespace-pre-wrap">{m.details}</td>
                        </tr>
                      )}
                      {m.note && (
                        <tr className="border-t border-slate-200">
                          <td className={label}>Σημείωση</td>
                          <td className="py-1.5 italic">{m.note}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </section>

                <p className="mt-6">
                  Παρακαλώ να ενεργήσετε και εσείς και να συνεργαστείτε μαζί μας, έτσι ώστε να υπάρξει συμμόρφωση του
                  παιδιού σας με τους σχολικούς κανονισμούς.
                </p>

                {/* Signature — the deputy who decided the measure */}
                <div className="mt-6 flex justify-end">
                  <div className="w-64 text-center">
                    <p>Ο/Η Β. Διευθυντής/ντρια</p>
                    <p className="mt-12 border-b border-black" />
                    <p className="mt-1 font-semibold">{signer}</p>
                  </div>
                </div>

                {/* Acknowledgement slip — cut off and returned */}
                <div className="mt-8 pt-5 border-t-2 border-dashed border-slate-500">
                  <p className="text-center text-[12px] font-bold uppercase tracking-widest">Δήλωση Γονέα / Κηδεμόνα</p>
                  <p className="mt-3">
                    Ενημερώθηκα για το παιδαγωγικό μέτρο που επιβλήθηκε στο παιδί μου,{" "}
                    <strong>{rs.student.user?.name ?? "—"}</strong> ({rs.group?.name ?? rs.student.group?.name ?? "—"}).
                  </p>
                  <div className="mt-8 grid grid-cols-[2fr_1fr_1fr] gap-6 text-center text-[12px] text-slate-600">
                    <p className="border-t border-black pt-1">Ονοματεπώνυμο</p>
                    <p className="border-t border-black pt-1">Υπογραφή</p>
                    <p className="border-t border-black pt-1">Ημερομηνία</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 18mm; }
          html, body { background: white !important; }
          .h-screen { height: auto !important; }
          .overflow-hidden, .overflow-y-auto { overflow: visible !important; }
          main { padding: 0 !important; }
          .letter-page { break-after: page; }
          .letter-page:last-child { break-after: auto; }
          /* Keep the dark section heading when printing. */
          .print-bg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
