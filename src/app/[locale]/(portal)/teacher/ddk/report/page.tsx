import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { getSchoolName, getSchoolYear } from "@/lib/schoolConfig";
import { ddkRating, schoolYearLabel, ddkCategoryParts, DDK_SECTIONS } from "@/lib/ddk";
import { loadDdkAwardsForStudents, type DdkReportAward } from "@/server/ddk";
import { PrintBar } from "./PrintBar";

const SECTION_ORDER = new Map(DDK_SECTIONS.map((s, i) => [s.key, i]));
const INTRO =
  "Το πρόγραμμα Δ.Δ.Κ. περιλαμβάνει όλες τις εξωδιδακτικές δραστηριότητες που διοργανώνονται από τη σχολική μονάδα και στις οποίες συμμετέχουν οι μαθητές/τριες του σχολείου με βάση την ισχύουσα εκπαιδευτική νομοθεσία.";

type Student = {
  id: string;
  name: string;
  group: string | null;
  studentId: string;
  gender: string | null;
  awards: DdkReportAward[];
  total: number;
};

// The two per-student documents the ΔΔΚ coordinator prints: the certificate
// (ΠΙΣΤΟΠΟΙΗΤΙΚΟ ΑΞΙΟΛΟΓΗΣΗΣ) and the detailed participation statement
// (ΑΝΑΛΥΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ΣΥΜΜΕΤΟΧΗΣ). A group prints them for every student.
export default async function DdkReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studentId?: string; groupId?: string; all?: string; doc?: string }>;
}) {
  const { locale } = await params;
  const { studentId, groupId, all, doc } = await searchParams;
  const allSchool = all === "1";
  const certOnly = doc === "cert"; // certificate only (no detailed statement)

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  if (!isEducator(auth.role) && !auth.roles.includes("SUPER_ADMIN")) redirect(`/${locale}/login`);
  if (!studentId && !groupId && !allSchool) notFound();

  const [schoolName, ranges] = await Promise.all([getSchoolName(), getSchoolYear()]);
  const schoolYear = schoolYearLabel(ranges.yearStart.getUTCFullYear());

  const profiles = await db.studentProfile.findMany({
    where: allSchool
      ? { user: { isActive: true } }
      : studentId
      ? { id: studentId }
      : { groupId, user: { isActive: true } },
    select: {
      id: true,
      studentId: true,
      gender: true,
      user: { select: { name: true } },
      group: { select: { name: true } },
    },
    orderBy: allSchool
      ? [{ group: { grade: "asc" } }, { group: { name: "asc" } }, { user: { name: "asc" } }]
      : { user: { name: "asc" } },
  });
  if (profiles.length === 0) notFound();

  const awardsByStudent = await loadDdkAwardsForStudents(profiles.map((p) => p.id), schoolYear, ranges);

  const students: Student[] = profiles.map((p) => {
    const awards = awardsByStudent.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.user?.name ?? "—",
      group: p.group?.name ?? null,
      studentId: p.studentId,
      gender: p.gender,
      awards,
      total: awards.reduce((s, a) => s + a.points, 0),
    };
  });

  const backHref = groupId ? `/${locale}/teacher/ddk?groupId=${groupId}` : `/${locale}/teacher/ddk`;

  return (
    <div className="bg-white text-slate-900">
      <PrintBar backHref={backHref} />
      {students.map((s, idx) => {
        const isLast = idx === students.length - 1;
        return (
          <div key={s.id}>
            <Certificate
              student={s}
              schoolName={schoolName}
              schoolYear={schoolYear}
              last={certOnly && isLast}
            />
            {!certOnly && (
              <Statement student={s} schoolName={schoolName} schoolYear={schoolYear} last={isLast} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── ΠΙΣΤΟΠΟΙΗΤΙΚΟ ΑΞΙΟΛΟΓΗΣΗΣ (certificate) ──────────────────────────────────
function Certificate({
  student,
  schoolName,
  schoolYear,
  last,
}: {
  student: Student;
  schoolName: string | null;
  schoolYear: string;
  last?: boolean;
}) {
  const noun =
    student.gender === "FEMALE" ? "Η ΜΑΘΗΤΡΙΑ" : student.gender === "MALE" ? "Ο ΜΑΘΗΤΗΣ" : "Ο/Η ΜΑΘΗΤΗΣ/ΤΡΙΑ";
  const perf =
    student.gender === "FEMALE" ? "η επίδοσή της" : student.gender === "MALE" ? "η επίδοσή του" : "η επίδοσή του/της";

  return (
    <div className={`mx-auto max-w-[210mm] min-h-[297mm] px-[22mm] py-[18mm] flex flex-col items-center text-center ${last ? "" : "break-after-page"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/coat-of-arms.svg" alt="" className="w-20 h-20" />
      <p className="mt-3 font-bold leading-snug">
        ΚΥΠΡΙΑΚΗ ΔΗΜΟΚΡΑΤΙΑ
        <br />
        ΥΠΟΥΡΓΕΙΟ ΠΑΙΔΕΙΑΣ,
        <br />
        ΑΘΛΗΤΙΣΜΟΥ ΚΑΙ ΝΕΟΛΑΙΑΣ
      </p>
      <p className="mt-5 font-bold leading-snug">
        ΠΡΟΓΡΑΜΜΑ
        <br />
        ΔΗΜΙΟΥΡΓΙΚΟΤΗΤΑ – ΔΡΑΣΗ – ΚΟΙΝΩΝΙΚΗ ΠΡΟΣΦΟΡΑ
      </p>
      <h1 className="mt-6 text-2xl font-bold">ΠΙΣΤΟΠΟΙΗΤΙΚΟ ΑΞΙΟΛΟΓΗΣΗΣ</h1>

      <div className="mt-5 text-sm text-left">
        <p>ΣΧΟΛΕΙΟ: <strong>{schoolName ?? "…………………………"}</strong></p>
        <p>ΣΧΟΛΙΚΗ ΧΡΟΝΙΑ: <strong>{schoolYear}</strong></p>
      </div>

      <p className="mt-6 max-w-[150mm] text-sm leading-relaxed">{INTRO}</p>

      <p className="mt-10 font-bold">{noun}</p>
      <p className="mt-3 text-xl font-bold">{student.name}</p>
      <p className="mt-2 text-sm">του τμήματος {student.group ?? "—"}</p>

      <p className="mt-6 text-sm">Συμμετείχε στο πρόγραμμα και {perf} χαρακτηρίζεται ως:</p>
      <p className="mt-2 text-lg font-bold">{ddkRating(student.total) || "—"}</p>

      <div className="mt-auto w-full pt-16 text-right text-sm">Ο/Η Διευθυντής/τρια</div>
    </div>
  );
}

// ── ΑΝΑΛΥΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ΣΥΜΜΕΤΟΧΗΣ (detailed statement) ──────────────────────
function Statement({
  student,
  schoolName,
  schoolYear,
  last,
}: {
  student: Student;
  schoolName: string | null;
  schoolYear: string;
  last: boolean;
}) {
  // Order awards by section then item for the nested headings.
  const rows = student.awards
    .map((a) => ({ ...a, parts: ddkCategoryParts(a.categoryCode) }))
    .sort(
      (a, b) =>
        (SECTION_ORDER.get(a.parts.sectionKey) ?? 99) - (SECTION_ORDER.get(b.parts.sectionKey) ?? 99) ||
        a.parts.itemNo - b.parts.itemNo
    );

  let curSection = "";
  let curItem = "";
  let curSub = "";

  return (
    <div className={`mx-auto max-w-[210mm] px-[18mm] py-[16mm] ${last ? "" : "break-after-page"}`}>
      <div className="flex items-start justify-between text-xs">
        <span>{schoolName ?? "…"}</span>
        <span>ΣΧΟΛΙΚΗ ΧΡΟΝΙΑ: {schoolYear}</span>
      </div>
      <h1 className="text-center text-sm font-bold mt-2">
        ΠΡΟΓΡΑΜΜΑ ΔΗΜΙΟΥΡΓΙΚΟΤΗΤΑ - ΔΡΑΣΗ - ΚΟΙΝΩΝΙΚΗ ΠΡΟΣΦΟΡΑ
      </h1>
      <h2 className="text-center text-sm font-bold mt-3">ΑΝΑΛΥΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ΣΥΜΜΕΤΟΧΗΣ ΕΤΟΥΣ</h2>

      <div className="mt-3 flex items-center justify-between border-t border-b border-slate-300 py-2 text-sm">
        <span>ΟΝΟΜΑ ΜΑΘΗΤΗ/ΤΡΙΑΣ: <strong>{student.name}</strong></span>
        <span>ΤΜΗΜΑ: <strong>{student.group ?? "—"}</strong></span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Δεν έχουν καταχωρηθεί δραστηριότητες ΔΔΚ.</p>
      ) : (
        <div className="mt-3 text-sm">
          {rows.map((r, i) => {
            const sectionNode = r.parts.sectionHeading !== curSection;
            if (sectionNode) curSection = r.parts.sectionHeading;
            const itemKey = `${r.parts.sectionKey}:${r.parts.itemNo}`;
            const itemNode = sectionNode || itemKey !== curItem;
            if (itemNode) curItem = itemKey;
            const subLabel = r.parts.sub ?? r.parts.itemLabel;
            const subKey = `${itemKey}:${subLabel}`;
            const subNode = itemNode || subKey !== curSub;
            if (subNode) curSub = subKey;
            return (
              <div key={i}>
                {sectionNode && <p className="font-bold mt-3">{r.parts.sectionHeading}</p>}
                {itemNode && (
                  <p className="font-semibold mt-1 pl-4">
                    {r.parts.itemNo}. {r.parts.itemLabel}
                  </p>
                )}
                {subNode && <p className="pl-8 mt-0.5">{subLabel}</p>}
                <p className="pl-12 text-slate-700">{r.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
