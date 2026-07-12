import { db } from "@/server/db";
import { redirect, notFound } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { getSchoolName, getSchoolYear } from "@/lib/schoolConfig";
import { staffDisplayName } from "@/lib/staffName";
import { PrintBar } from "./PrintBar";

// Official ΑΔΕΙΑ ΕΞΟΔΟΥ form (per exit_permit.pdf): two copies on one A4 —
// the top copy carries the return-time line, the bottom copy does not.

function Dots({ w = "w-40" }: { w?: string }) {
  return <span className={`inline-block ${w} border-b border-dotted border-slate-500 align-baseline`}>&nbsp;</span>;
}

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
  if (!auth) redirect(`/${locale}/login/staff`);
  // The paper travels to the current teacher — any educator may view it;
  // the super admin reaches it from the admin permits log.
  if (!isEducator(auth.role) && !auth.roles.includes("SUPER_ADMIN")) {
    redirect(`/${locale}/login/staff`);
  }

  const [permit, schoolName, schoolYear] = await Promise.all([
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
      },
    }),
    getSchoolName(),
    getSchoolYear(),
  ]);
  if (!permit) notFound();

  const startYear = schoolYear.yearStart.getUTCFullYear();
  const yearLabel = `${startYear}-${startYear + 1}`;

  const weekday = permit.date.toLocaleDateString("el-GR", { weekday: "long", timeZone: "UTC" });
  const dateLabel = permit.date.toLocaleDateString("el-GR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  });
  const timeLabel = permit.issuedAt.toLocaleTimeString("el-GR", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia",
  });

  const Copy = ({ withReturn }: { withReturn: boolean }) => (
    <div className="text-[12px] leading-snug text-slate-900">
      {/* Header: school (Settings) + computed school year */}
      <div className="flex justify-between text-xs mb-2">
        <span>ΣΧΟΛΕΙΟ: {schoolName ?? "—"}</span>
        <span>ΣΧΟΛΙΚΗ ΧΡΟΝΙΑ: {yearLabel}</span>
      </div>

      <h1 className="text-center font-bold underline underline-offset-2 mb-2">
        ΑΔΕΙΑ ΕΞΟΔΟΥ ΑΠΟ ΤΟ ΣΧΟΛΕΙΟ
      </h1>

      <div className="flex justify-between gap-4">
        <span>
          <span className="font-semibold">Α. ΜΑΘΗΤΗΣ:</span>{" "}
          {permit.student.studentId} {permit.student.user?.name ?? ""}
        </span>
        <span>
          <span className="font-semibold">ΤΑΞΗ-ΤΜΗΜΑ:</span> {permit.student.group?.name ?? "—"}
        </span>
      </div>
      <p>
        <span className="font-semibold">Β. ΛΟΓΟΣ ΑΠΟΧΩΡΗΣΗΣ:</span>{" "}
        <span className="ml-4">{permit.reason}</span>
      </p>

      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-6">
        <span className="font-semibold">Γ. ΑΝΑΧΩΡΗΣΗ ΑΠΟ ΤΟ ΣΧΟΛΕΙΟ:</span>
        <span>
          Ημέρα: {weekday} <span className="ml-6">Ημερομηνία: {dateLabel}</span>
          <span className="block">Ώρα: {timeLabel}</span>
        </span>
        {withReturn && (
          <>
            <span className="font-semibold">Δ. ΕΠΙΣΤΡΟΦΗ ΣΤΟ ΣΧΟΛΕΙΟ:</span>
            <span>
              Ώρα: <Dots w="w-24" />
            </span>
          </>
        )}
      </div>

      {/* Signatures */}
      <div className="mt-2 grid grid-cols-2 gap-10 text-center">
        <div className="flex flex-col justify-end">
          <p>Ο/Η Καθηγητής/τρια</p>
          <p className="border-b border-slate-700 mx-6 mt-4">&nbsp;</p>
        </div>
        <div className="flex flex-col justify-end">
          <p>Ο/Η Βοηθός Διευθυντής/τρια</p>
          <p className="mt-auto">{staffDisplayName(permit.issuer)}</p>
          <p className="border-b border-slate-700 mx-6">&nbsp;</p>
        </div>
      </div>

      <hr className="my-2 border-slate-700" />

      {/* Doctor / service certification */}
      <h2 className="text-center font-bold underline underline-offset-2 mb-1">
        ΟΤΑΝ Ο ΜΑΘΗΤΗΣ ΕΠΙΣΚΕΦΤΕΙ ΓΙΑΤΡΟ / ΑΛΛΗ ΥΠΗΡΕΣΙΑ
      </h2>
      <p>
        Βεβαιώνω ότι ο πιο πάνω αναφερόμενος μαθητής με επισκέφτηκε σήμερα και ώρα: <Dots w="w-32" />
      </p>
      <div className="flex justify-between gap-4">
        <span>Ημερομηνία: {dateLabel}</span>
        <span>
          Υπογραφή: <Dots w="w-48" />
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span>
          Τηλέφωνο: <Dots w="w-48" />
        </span>
        <span>
          Ολογράφως: <Dots w="w-48" />
        </span>
      </div>

      <hr className="my-2 border-slate-700" />

      {/* Parent declaration */}
      <h2 className="text-center font-bold underline underline-offset-2 mb-1">
        ΔΗΛΩΣΗ ΓΟΝΕΑ / ΚΗΔΕΜΟΝΑ
      </h2>
      <p>Κύριε Διευθυντή,</p>
      <p className="ml-6">Δηλώνω ότι έλαβα γνώση για την άδεια εξόδου του παιδιού μου από το σχολείο</p>
      <div className="flex justify-between gap-4">
        <span>
          Ημερομηνία: <Dots w="w-48" />
        </span>
        <span>
          Υπογραφή: <Dots w="w-48" />
        </span>
      </div>
    </div>
  );

  return (
    <>
      <PrintBar backHref={`/${locale}/teacher/duty${back ? `?${back}` : ""}`} />

      <div className="min-h-screen print:min-h-0 bg-white print:bg-white">
        <div className="max-w-2xl mx-auto px-10 py-8 print:max-w-none print:px-[12mm] print:py-[10mm]">
          {/* Copy 1 — with the return-time line */}
          <Copy withReturn />

          {/* Cut line between the two copies */}
          <div className="my-12 print:my-[16mm] flex items-center justify-center">
            <span className="w-56 border-t border-dashed border-slate-300" />
          </div>

          {/* Copy 2 — without the return-time line */}
          <Copy withReturn={false} />
        </div>
      </div>

      <style>{`
        @media print {
          /* margin: 0 removes the browser-added header/footer (date, title,
             URL, page number live in the page margin); the inner container
             carries the real margins via print padding instead. */
          @page { size: A4; margin: 0; }
          body { background: white !important; }
        }
      `}</style>
    </>
  );
}
