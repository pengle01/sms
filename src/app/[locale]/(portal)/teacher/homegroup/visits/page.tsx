import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveAuth } from "@/server/authz";
import { groupsForStaff } from "@/server/behaviorReport";
import { visitListForGroup } from "@/server/visitHours";
import { getSchoolName } from "@/lib/schoolConfig";
import { VisitList } from "@/components/visits/VisitList";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

/** A homegroup's teachers with their visit hours, on screen and on paper. Own homegroups only. */
export default async function HomegroupVisitsPage({
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

  const groups = await groupsForStaff(auth.userId);
  const back = `/${locale}/teacher/homegroup`;
  if (groups.length === 0) redirect(back);
  const active = groups.find((g) => g.id === groupId) ?? groups[0]!;

  const [t, schoolName, rows] = await Promise.all([
    getTranslations("visitHours"),
    getSchoolName(),
    visitListForGroup(active.id),
  ]);

  return (
    <>
      <PrintBar backHref={`${back}?groupId=${active.id}`} />
      <div className="max-w-4xl mx-auto px-6 py-6 print:px-0 print:py-0 print:max-w-none space-y-4">
        {groups.length > 1 && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`?groupId=${g.id}`}
                className={`h-9 px-4 inline-flex items-center rounded-lg text-sm font-medium border ${
                  g.id === active.id ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                {g.name}
              </Link>
            ))}
          </div>
        )}
        <div className="pb-3 border-b-2 border-black">
          {schoolName && <p className="text-xs uppercase tracking-widest text-slate-500">{schoolName}</p>}
          <h1 className="text-xl font-bold text-slate-900 mt-1">{t("title")}</h1>
          <p className="text-sm text-slate-600 mt-0.5">{active.name}</p>
        </div>
        <VisitList rows={rows} />
      </div>
    </>
  );
}
