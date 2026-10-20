import { redirect, notFound } from "next/navigation";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { canReadReferral } from "@/server/referralAccess";
import { measureSummary, expulsionWhere, letterOffence, parentLines, letterDate } from "@/lib/referralLetter";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

/**
 * «ΓΡΑΠΤΗ ΕΝΗΜΕΡΩΣΗ ΓΟΝΕΩΝ/ΚΗΔΕΜΟΝΩΝ ΓΙΑ ΕΠΙΒΟΛΗ ΠΑΙΔΑΓΩΓΙΚΩΝ ΜΕΤΡΩΝ» — one A4
 * per resolved student of the referral (`?student=` for just one), signed by
 * the deputy who decided the measure, with the parent's acknowledgement slip.
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

  const referral = await db.referral.findUnique({
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
              expulsionDays: { select: { id: true } },
              resolvedBy: { select: { name: true, staffProfile: { select: { scheduleName: true } } } },
            },
          },
        },
      },
    },
  });
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
          const days = res.action === "DETENTION" ? res.expulsionDays.length : 0;
          const where = expulsionWhere(days);
          const parents = parentLines(rs.student.smsContacts);
          const signer = res.resolvedBy?.staffProfile?.scheduleName ?? res.resolvedBy?.name ?? "";
          return (
            <div key={rs.id} className="letter-page bg-white text-black">
              <div className="mx-auto max-w-3xl px-12 py-10 print:max-w-none print:px-0 print:py-0 text-[13px] leading-relaxed">
                <h1 className="text-center font-bold underline underline-offset-2 mb-6">
                  ΓΡΑΠΤΗ ΕΝΗΜΕΡΩΣΗ ΓΟΝΕΩΝ/ΚΗΔΕΜΟΝΩΝ ΓΙΑ ΕΠΙΒΟΛΗ ΠΑΙΔΑΓΩΓΙΚΩΝ ΜΕΤΡΩΝ
                </h1>

                <p>Προς το γονέα/κηδεμόνα του μαθητή:</p>
                <p className="flex flex-wrap gap-x-10">
                  <strong>{rs.student.user?.name ?? "—"}</strong>
                  <span>
                    του τμήματος: <strong className="ml-4">{rs.group?.name ?? rs.student.group?.name ?? "—"}</strong>
                  </span>
                </p>

                <div className="mt-3 min-h-[3.5rem]">
                  {rs.student.address && <p>{rs.student.address}</p>}
                  {parents.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>

                <p className="mt-6">
                  Με το σημείωμα αυτό σας πληροφορώ ότι επιβλήθηκαν στο παιδί σας τα πιο κάτω παιδαγωγικά μέτρα:
                </p>
                <p className="font-bold">{measureSummary(res.action, days, res.actionDetails)}</p>

                {where && (
                  <p className="mt-6">
                    Για τη διάρκεια του παιδαγωγικού μέτρου ο μαθητής θα πρέπει να βρίσκεται στο{" "}
                    <strong className="underline ml-4">{where}</strong>
                  </p>
                )}

                <p className="mt-6">Παράπτωμα:</p>
                <p className="font-bold whitespace-pre-wrap">{offence}</p>

                <p className="mt-6">
                  Παρακαλώ να ενεργήσετε και εσείς και να συνεργαστείτε μαζί μας, έτσι ώστε να υπάρξει συμμόρφωση του
                  παιδιού σας με τους σχολικούς κανονισμούς.
                </p>

                <div className="mt-2 grid grid-cols-2 gap-8">
                  <div>
                    <p className="pl-10">Ημερομηνία</p>
                    <p className="mt-6 pl-6">{letterDate(res.resolvedAt)}</p>
                  </div>
                  <div className="text-center">
                    <p>Ο/Η Β.Διευθυντής/ντρια</p>
                    <p className="mt-2">{signer}</p>
                    <p className="mt-8 mx-10 border-b border-black" />
                  </div>
                </div>

                <hr className="my-6 border-black" />

                <p>Δήλωση Γονέα / Κηδεμόνα</p>
                <p className="mt-3">Ενημερώθηκα για τα παιδαγωγικά μέτρα που επιβλήθηκαν στο παιδί μου.</p>
                <p className="mt-6">Ονοματεπώνυμο : ………………………………………………………………………………………</p>
                <p className="mt-6">Υπογραφή : ……………………………………… Ημερομηνία : ………………………………</p>
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
        }
      `}</style>
    </>
  );
}
