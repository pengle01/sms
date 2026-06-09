import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { getSchoolName, getSchoolYear } from "@/lib/schoolConfig";
import { getNow } from "@/lib/dates";
import {
  ddkTotal,
  ddkRating,
  schoolYearLabel,
  summarizeBySection,
  ddkCategoryLabel,
} from "@/lib/ddk";
import { fullAttendanceAwards } from "@/server/ddk";
import { PrintBar } from "./PrintBar";

type Award = { categoryCode: string; points: number; note?: string | null };
type ReportStudent = {
  id: string;
  name: string;
  group: string | null;
  studentId: string;
  awards: Award[];
};

function fmtFull(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

// Year-end ΔΔΚ report (one A4 per student) the coordinator prints and awards.
// Mirrors the Ministry's evaluation guide: contribution by section, total,
// rating. Keeps DD/MM/YYYY like the other official print documents.
export default async function DdkReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studentId?: string; groupId?: string }>;
}) {
  const { locale } = await params;
  const { studentId, groupId } = await searchParams;

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  if (!isEducator(auth.role) && !auth.roles.includes("SUPER_ADMIN")) {
    redirect(`/${locale}/login`);
  }
  if (!studentId && !groupId) notFound();

  const [schoolName, ranges] = await Promise.all([getSchoolName(), getSchoolYear()]);
  const schoolYear = schoolYearLabel(ranges.yearStart.getUTCFullYear());

  const profiles = await db.studentProfile.findMany({
    where: studentId ? { id: studentId } : { groupId, user: { isActive: true } },
    include: {
      user: { select: { name: true } },
      group: { select: { name: true } },
      ddkAwards: { where: { schoolYear }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { user: { name: "asc" } },
  });
  if (profiles.length === 0) notFound();

  // The Πλήρης Φοίτηση point is computed from absences, not stored.
  const autoAwards = await fullAttendanceAwards(profiles.map((s) => s.id), ranges);
  const students: ReportStudent[] = profiles.map((s) => {
    const auto = autoAwards.get(s.id);
    return {
      id: s.id,
      name: s.user?.name ?? "—",
      group: s.group?.name ?? null,
      studentId: s.studentId,
      awards: [
        ...s.ddkAwards.map((a) => ({ categoryCode: a.categoryCode, points: a.points, note: a.note })),
        ...(auto ? [auto] : []),
      ],
    };
  });

  const backHref = groupId
    ? `/${locale}/teacher/ddk?groupId=${groupId}`
    : `/${locale}/teacher/ddk`;
  const todayLabel = fmtFull(getNow());

  return (
    <div className="bg-white">
      <PrintBar backHref={backHref} />

      <div className="mx-auto">
        {students.map((s, idx) => {
          const total = ddkTotal(s.awards);
          const sections = summarizeBySection(s.awards);
          return (
            <div
              key={s.id}
              className={`mx-auto max-w-[210mm] px-[18mm] py-[16mm] text-slate-900 ${
                idx < students.length - 1 ? "break-after-page" : ""
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between text-sm">
                <span>ΣΧΟΛΕΙΟ: {schoolName ?? "…………………………"}</span>
                <span>ΣΧΟΛΙΚΗ ΧΡΟΝΙΑ: {schoolYear}</span>
              </div>
              <h1 className="text-center text-lg font-bold mt-4">
                Αξιολόγηση μαθητή στο Δ.Δ.Κ.
              </h1>
              <p className="text-center text-xs text-slate-500">
                Δημιουργικότητα · Δράση · Κοινωνική Προσφορά
              </p>

              {/* Student */}
              <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <span>Ονοματεπώνυμο: <strong>{s.name}</strong></span>
                <span>Τμήμα: <strong>{s.group ?? "—"}</strong></span>
                <span>Αρ. Μητρώου: <strong>{s.studentId}</strong></span>
              </div>

              {/* Awards by section */}
              <table className="w-full mt-5 text-sm border border-slate-400 border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 px-3 py-1.5 text-left">Τομέας δράσης / προσφοράς</th>
                    <th className="border border-slate-400 px-3 py-1.5 text-right w-24">Μονάδες</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.length === 0 ? (
                    <tr>
                      <td className="border border-slate-400 px-3 py-2 text-slate-400" colSpan={2}>
                        Δεν έχουν καταχωρηθεί δραστηριότητες ΔΔΚ.
                      </td>
                    </tr>
                  ) : (
                    sections.map((sec) => (
                      <SectionRows key={sec.section.key} label={sec.section.label} awards={sec.awards} points={sec.points} />
                    ))
                  )}
                  <tr className="bg-slate-50 font-bold">
                    <td className="border border-slate-400 px-3 py-1.5 text-right">Σύνολο Μονάδων</td>
                    <td className="border border-slate-400 px-3 py-1.5 text-right">{total}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="border border-slate-400 px-3 py-1.5 text-right">Χαρακτηρισμός</td>
                    <td className="border border-slate-400 px-3 py-1.5 text-right">{ddkRating(total) || "—"}</td>
                  </tr>
                </tbody>
              </table>

              {/* Signatures */}
              <div className="mt-12 flex items-end justify-between text-sm">
                <div className="text-center">
                  <div className="w-48 border-b border-slate-500 mb-1">&nbsp;</div>
                  <span>Υπεύθυνος/η ΔΔΚ</span>
                </div>
                <div className="text-center">
                  <span className="block mb-6">Ημερομηνία: {todayLabel}</span>
                  <div className="w-48 border-b border-slate-500 mb-1">&nbsp;</div>
                  <span>Ο/Η Διευθυντής/ντρια</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionRows({
  label,
  awards,
  points,
}: {
  label: string;
  awards: Award[];
  points: number;
}) {
  return (
    <>
      <tr className="bg-slate-50">
        <td className="border border-slate-400 px-3 py-1 font-semibold" colSpan={2}>
          {label}
        </td>
      </tr>
      {awards.map((a, i) => (
        <tr key={i}>
          <td className="border border-slate-400 px-3 py-1 pl-6">
            {ddkCategoryLabel(a.categoryCode)}
            {a.note && <span className="text-slate-500"> — {a.note}</span>}
          </td>
          <td className="border border-slate-400 px-3 py-1 text-right">{a.points}</td>
        </tr>
      ))}
      <tr>
        <td className="border border-slate-400 px-3 py-1 text-right text-slate-500 text-xs">Μερικό σύνολο</td>
        <td className="border border-slate-400 px-3 py-1 text-right font-medium">{points}</td>
      </tr>
    </>
  );
}
