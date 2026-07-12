import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { getSchoolName, getSchoolYear } from "@/lib/schoolConfig";
import { schoolYearLabel, ddkCategoryParts, DDK_SECTIONS } from "@/lib/ddk";
import { loadDdkAwardsForStudents, type DdkReportAward } from "@/server/ddk";
import { PrintBar } from "../report/PrintBar";

const SECTION_ORDER = new Map(DDK_SECTIONS.map((s, i) => [s.key, i]));

function fmtFull(d: Date | null): string {
  if (!d) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

type Row = DdkReportAward & { activityName: string };
type ItemGroup = { sectionHeading: string; itemNo: number; itemLabel: string; rows: Row[] };

// Group enriched awards by section → numbered item, in the guide's order.
function groupBySectionItem(awards: DdkReportAward[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup & { sortKey: [number, number] }>();
  for (const a of awards) {
    const p = ddkCategoryParts(a.categoryCode);
    const key = `${p.sectionKey}:${p.itemNo}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        sectionHeading: p.sectionHeading,
        itemNo: p.itemNo,
        itemLabel: p.itemLabel,
        rows: [],
        sortKey: [SECTION_ORDER.get(p.sectionKey) ?? 99, p.itemNo],
      };
      groups.set(key, g);
    }
    g.rows.push({ ...a, activityName: p.sub ?? p.itemLabel });
  }
  return [...groups.values()].sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1]);
}

// ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ ΤΜΗΜΑΤΟΣ — the per-class ΔΔΚ activities report: activities the
// whole class did, then each student's individual activities with points.
export default async function DdkClassReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string }>;
}) {
  const { locale } = await params;
  const { groupId } = await searchParams;

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!isEducator(auth.role) && !auth.roles.includes("SUPER_ADMIN")) redirect(`/${locale}/login/staff`);
  if (!groupId) notFound();

  const [schoolName, ranges, group] = await Promise.all([
    getSchoolName(),
    getSchoolYear(),
    db.group.findUnique({ where: { id: groupId }, select: { name: true } }),
  ]);
  if (!group) notFound();
  const schoolYear = schoolYearLabel(ranges.yearStart.getUTCFullYear());

  const students = await db.studentProfile.findMany({
    where: { groupId, user: { isActive: true } },
    select: { id: true, studentId: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const ids = students.map((s) => s.id);
  const awardsByStudent = await loadDdkAwardsForStudents(ids, schoolYear, ranges);

  // Whole-class = a (converted) activity every active student of the class got.
  const byActivity = new Map<string, Set<string>>();
  for (const [sid, awards] of awardsByStudent) {
    for (const a of awards) {
      if (!a.activityId) continue;
      (byActivity.get(a.activityId) ?? byActivity.set(a.activityId, new Set()).get(a.activityId)!).add(sid);
    }
  }
  const wholeClass = new Set(
    [...byActivity.entries()].filter(([, set]) => ids.length > 0 && set.size === ids.length).map(([aid]) => aid)
  );

  // Part 1 — one entry per whole-class activity (representative award).
  const wholeClassAwards: DdkReportAward[] = [];
  const seen = new Set<string>();
  for (const awards of awardsByStudent.values()) {
    for (const a of awards) {
      if (a.activityId && wholeClass.has(a.activityId) && !seen.has(a.activityId)) {
        seen.add(a.activityId);
        wholeClassAwards.push(a);
      }
    }
  }
  const wholeClassGroups = groupBySectionItem(wholeClassAwards);

  // Part 2 — each student's individual awards (excludes whole-class activities).
  const perStudent = students.map((s) => {
    const individual = (awardsByStudent.get(s.id) ?? []).filter(
      (a) => !a.activityId || !wholeClass.has(a.activityId)
    );
    return { ...s, groups: groupBySectionItem(individual), count: individual.length };
  });

  const backHref = `/${locale}/teacher/ddk?groupId=${groupId}`;

  return (
    <div className="bg-white text-slate-900 text-sm">
      <PrintBar backHref={backHref} />

      {/* Part 1 — whole class */}
      <div className="mx-auto max-w-[260mm] px-[14mm] py-[12mm] break-after-page">
        <div className="flex items-start justify-between text-xs">
          <span>{schoolName ?? "…"}</span>
          <span>ΣΧΟΛΙΚΗ ΧΡΟΝΙΑ: {schoolYear}</span>
        </div>
        <h1 className="text-center font-bold underline mt-1">ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ ΤΜΗΜΑΤΟΣ: {group.name}</h1>
        <p className="font-semibold italic mt-2">Δραστηριότητες στις οποίες συμμετείχε ολόκληρο το τμήμα:</p>

        {wholeClassGroups.length === 0 ? (
          <p className="mt-2 text-slate-400">—</p>
        ) : (
          wholeClassGroups.map((g) => (
            <div key={`${g.sectionHeading}:${g.itemNo}`} className="mt-2">
              <p className="font-bold">{g.sectionHeading}</p>
              <p className="font-semibold pl-4">{g.itemNo}. {g.itemLabel}</p>
              <table className="w-full mt-1 border border-slate-400 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="border border-slate-400 px-2 py-1">Δραστηριότητα</th>
                    <th className="border border-slate-400 px-2 py-1 w-28">Ημερομηνία</th>
                    <th className="border border-slate-400 px-2 py-1 w-48">Υπεύθυνος Καθηγητής</th>
                    <th className="border border-slate-400 px-2 py-1">Περιγραφή</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="border border-slate-400 px-2 py-1">{r.activityName}</td>
                      <td className="border border-slate-400 px-2 py-1">{fmtFull(r.date)}</td>
                      <td className="border border-slate-400 px-2 py-1">{r.responsibleTeacher || "—"}</td>
                      <td className="border border-slate-400 px-2 py-1">{r.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {/* Part 2 — per student */}
      <div className="mx-auto max-w-[260mm] px-[14mm] py-[12mm]">
        <div className="flex items-start justify-between text-xs">
          <span>{schoolName ?? "…"}</span>
          <span>ΣΧΟΛΙΚΗ ΧΡΟΝΙΑ: {schoolYear}</span>
        </div>
        <h1 className="text-center font-bold underline mt-1">ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ ΜΑΘΗΤΩΝ ΤΜΗΜΑΤΟΣ: {group.name}</h1>
        <p className="font-semibold italic mt-2">Δραστηριότητες στις οποίες συμμετείχαν ατομικά οι μαθητές:</p>

        {perStudent.map((s) => (
          <div key={s.id} className="mt-3">
            <p className="font-semibold">
              <span className="font-mono text-slate-500">{s.studentId}</span> {s.user?.name}{" "}
              <span className="font-normal text-slate-500">
                {s.count === 0
                  ? "(Δεν υπάρχουν δραστηριότητες.)"
                  : `(Συμμετέχει σε ${s.count} δραστηριότητες.)`}
              </span>
            </p>
            {s.groups.map((g) => (
              <div key={`${g.sectionHeading}:${g.itemNo}`} className="mt-1 pl-4">
                <p className="font-bold">{g.sectionHeading}</p>
                <p className="font-semibold pl-4">{g.itemNo}. {g.itemLabel}</p>
                <table className="w-full mt-1 border border-slate-400 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      <th className="border border-slate-400 px-2 py-1">Δραστηριότητα</th>
                      <th className="border border-slate-400 px-2 py-1">Περιγραφή</th>
                      <th className="border border-slate-400 px-2 py-1 w-40">Καταχωρήθηκε από</th>
                      <th className="border border-slate-400 px-2 py-1 w-40">Υπ. Καθηγητής</th>
                      <th className="border border-slate-400 px-2 py-1 w-24">Ημερομηνία</th>
                      <th className="border border-slate-400 px-2 py-1 w-12 text-right">ΔΔΚ.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="border border-slate-400 px-2 py-1">{r.activityName}</td>
                        <td className="border border-slate-400 px-2 py-1">{r.description}</td>
                        <td className="border border-slate-400 px-2 py-1">{r.recordedBy || "—"}</td>
                        <td className="border border-slate-400 px-2 py-1">{r.responsibleTeacher || "—"}</td>
                        <td className="border border-slate-400 px-2 py-1">{fmtFull(r.date)}</td>
                        <td className="border border-slate-400 px-2 py-1 text-right">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
