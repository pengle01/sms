import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BarChart3, ChevronLeft, Users, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getActiveAuth } from "@/server/authz";
import { fromAppTimeline, utcMidnight } from "@/lib/dates";
import {
  STATS_RANGES,
  averageMinutes,
  canFileMaintenance,
  isStatsRange,
  maintenanceStats,
  resolutionsOf,
  seesAll,
  splitMinutes,
  statsWindow,
  type StatsRow,
} from "@/lib/maintenance";
import { getMaintenanceViewer, resolutionsIn } from "@/server/maintenance";
import { EquipmentIcon } from "./ui";

/**
 * «Στατιστικά»: jobs finished and time spent, per IT person and per kind of
 * equipment — for the IT manager and the admin. Built from the resolutions in
 * the chosen period; the time is what each person logged when resolving.
 * Collectively (everyone, with a table per person), or for one person.
 */
export async function MaintenanceStats({
  basePath,
  range: rawRange,
  person: rawPerson,
}: {
  basePath: string;
  range?: string;
  person?: string;
}) {
  const auth = await getActiveAuth();
  if (!auth || !canFileMaintenance(auth.roles)) notFound();
  const viewer = await getMaintenanceViewer(auth);
  if (!seesAll(viewer)) notFound();

  const t = await getTranslations("maintenance");
  const range = isStatsRange(rawRange) ? rawRange : "month";
  // The window is on the app's timeline (the faked "today" in testing); the
  // events' createdAt are real, so map the bounds back before querying.
  const w = statsWindow(range, utcMidnight());
  const resolutions = await resolutionsIn({
    from: w.from && fromAppTimeline(w.from),
    to: w.to && fromAppTimeline(w.to),
  });
  const everyone = maintenanceStats(resolutions);
  const { personId, rows } = resolutionsOf(resolutions, rawPerson);
  const stats = personId ? maintenanceStats(rows) : everyone;
  const personName = personId ? everyone.byPerson.find((p) => p.personId === personId)?.personName : null;
  const href = (q: { range?: string; person?: string | null }) => {
    const sp = new URLSearchParams({ range: q.range ?? range });
    const p = q.person === undefined ? personId : q.person;
    if (p) sp.set("person", p);
    return `${basePath}/stats?${sp.toString()}`;
  };
  const pill = (active: boolean) =>
    cn(
      "h-9 px-3 rounded-xl text-sm font-medium transition-colors border inline-flex items-center gap-1.5",
      active
        ? "bg-emerald-600 text-white border-emerald-600"
        : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
    );

  const dur = (min: number | null) => (min === null ? "—" : t("duration", splitMinutes(min)));
  const th = "text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide";
  const num = "px-4 py-2.5 text-right tabular-nums";
  const cells = (r: StatsRow) => (
    <>
      <td className={num}>{r.jobs}</td>
      <td className={num}>{dur(r.minutes)}</td>
      <td className={num}>{dur(averageMinutes(r))}</td>
    </>
  );
  const head = (first: string) => (
    <thead>
      <tr className="border-b border-slate-100">
        <th className={th}>{first}</th>
        <th className={cn(th, "text-right")}>{t("statsJobs")}</th>
        <th className={cn(th, "text-right")}>{t("statsTime")}</th>
        <th className={cn(th, "text-right")}>{t("statsAverage")}</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-5">
      <div>
        <Link href={basePath} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ChevronLeft className="w-4 h-4" />
          {t("title")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          {t("statsTitle")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">{t("statsSubtitle")}</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATS_RANGES.map((r) => (
          <Link key={r} href={href({ range: r })} className={pill(r === range)}>
            {t(`statsRange_${r}` as Parameters<typeof t>[0])}
          </Link>
        ))}
      </div>

      {everyone.byPerson.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("statsView")}</p>
          <div className="flex gap-2 flex-wrap">
            <Link href={href({ person: null })} className={pill(!personId)}>
              <Users className="w-4 h-4" />
              {t("statsEveryone")}
            </Link>
            {everyone.byPerson.map((p) => (
              <Link key={p.personId} href={href({ person: p.personId })} className={pill(p.personId === personId)}>
                <User className="w-4 h-4" />
                {p.personName}
                <span className="text-xs opacity-70">{p.jobs}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h3 className="text-base font-semibold text-slate-800">
        {personName ? t("statsFor", { name: personName }) : t("statsCollective")}
      </h3>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: t("statsJobs"), value: String(stats.total.jobs) },
          { label: t("statsTime"), value: dur(stats.total.minutes) },
          { label: t("statsAverage"), value: dur(averageMinutes(stats.total)) },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{k.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.total.jobs === 0 ? (
        <p className="text-center py-12 text-slate-400">{t("statsEmpty")}</p>
      ) : (
        <>
          {!personId && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("statsByPerson")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                {head(t("statsPerson"))}
                <tbody className="divide-y divide-slate-100">
                  {stats.byPerson.map((p) => (
                    <tr key={p.personId}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        <Link href={href({ person: p.personId })} className="hover:text-emerald-700 hover:underline">
                          {p.personName}
                        </Link>
                      </td>
                      {cells(p)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("statsByEquipment")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                {head(t("fieldEquipmentShort"))}
                <tbody className="divide-y divide-slate-100">
                  {stats.byEquipment.map((e) => (
                    <tr key={e.equipment}>
                      <td className="px-4 py-2.5 text-slate-800">
                        <span className="inline-flex items-center gap-1.5">
                          <EquipmentIcon equipment={e.equipment} className="w-4 h-4 text-slate-500" />
                          {t(`equipment.${e.equipment}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      {cells(e)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {stats.total.untimed > 0 && (
            <p className="text-xs text-slate-500">{t("statsUntimed", { count: stats.total.untimed })}</p>
          )}
        </>
      )}
    </div>
  );
}
