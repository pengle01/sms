import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { getSchoolName, getSchoolYear } from "@/lib/schoolConfig";
import { fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import { ddkCategoryLabel, groupAwardsByActivity, myDdkSummary, schoolYearLabel } from "@/lib/ddk";
import { loadMyDdkAwards } from "@/server/ddk";
import { PrintBar } from "../../report/PrintBar";

/** «Τα ΔΔΚ μου» (on «Δραστηριότητες») on A4: the teacher's awards for a school year, by activity. */
export default async function MyDdkPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale } = await params;
  const { year } = await searchParams;
  const auth = await getActiveAuth();
  if (!auth || !isEducator(auth.role)) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, scheduleName: true, user: { select: { name: true } } },
  });
  if (!staff) redirect(`/${locale}/teacher/dashboard`);

  const [t, ranges, schoolName] = await Promise.all([getTranslations("ddkMine"), getSchoolYear(), getSchoolName()]);
  const currentYear = schoolYearLabel(ranges.yearStart.getUTCFullYear());
  const schoolYear = year && /^\d{4}-\d{4}$/.test(year) ? year : currentYear;
  const awards = await loadMyDdkAwards(staff.id, schoolYear);
  const groups = groupAwardsByActivity(awards);
  const summary = myDdkSummary(awards);
  const backHref = `/${locale}/teacher/activities${schoolYear === currentYear ? "" : `?ddkYear=${schoolYear}`}`;

  const cell = "border border-slate-400 px-2 py-1";

  return (
    <div className="bg-white text-slate-900">
      <PrintBar backHref={backHref} />
      <div className="mx-auto max-w-[210mm] px-[16mm] py-[14mm] text-sm">
        <div className="flex items-start justify-between text-xs">
          <span>{schoolName ?? "…"}</span>
          <span>{t("printYear", { year: schoolYear })}</span>
        </div>
        <h1 className="text-center font-bold mt-2">{t("printTitle")}</h1>
        <h2 className="text-center mt-1">{t("printTeacher", { name: staffDisplayName(staff) })}</h2>

        {groups.length === 0 && <p className="mt-6 text-center text-slate-500">{t("empty", { year: schoolYear })}</p>}

        {groups.map((g) => (
          <section key={g.activity?.id ?? "none"} className="mt-5 break-inside-avoid">
            <h3 className="font-bold">
              {g.activity ? `${g.activity.name} — ${fmtDisplayDate(g.activity.date)}` : t("noActivity")}
            </h3>
            <table className="w-full mt-1 border border-slate-400 border-collapse">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className={`${cell} w-8 text-right`}>#</th>
                  <th className={`${cell} w-24`}>{t("colRegistry")}</th>
                  <th className={cell}>{t("colStudent")}</th>
                  <th className={`${cell} w-16`}>{t("colGroup")}</th>
                  <th className={cell}>{t("colCategory")}</th>
                  <th className={`${cell} w-16 text-right`}>{t("colPoints")}</th>
                </tr>
              </thead>
              <tbody>
                {g.awards.map((a, i) => (
                  <tr key={a.id}>
                    <td className={`${cell} text-right text-slate-500`}>{i + 1}</td>
                    <td className={`${cell} font-mono`}>{a.registryNo}</td>
                    <td className={cell}>
                      {a.studentName}
                      {a.note && <span className="block text-xs text-slate-500">{a.note}</span>}
                    </td>
                    <td className={cell}>{a.groupName ?? ""}</td>
                    <td className={`${cell} text-xs`}>{ddkCategoryLabel(a.categoryCode)}</td>
                    <td className={`${cell} text-right font-semibold`}>{a.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {groups.length > 0 && (
          <p className="mt-4 text-xs text-slate-600">
            {t("summary", { year: schoolYear, awards: summary.awards, students: summary.students, points: summary.points })}
          </p>
        )}
      </div>
    </div>
  );
}
