import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, LifeBuoy, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  canViewSpecialEdFull,
  filterSupportRoster,
  parseSupportKind,
  supportRoster,
  SUPPORT_KINDS,
  SUPPORT_KIND_BADGE,
  SUPPORT_KIND_LABEL_KEY,
  type SupportKind,
} from "@/lib/specialEd";
import { listSupportEnrolments } from "@/server/specialEd";

// «Στήριξη»: which students attend group (ΣΤ), one-to-one (ΑΣΤ/ΑΤ/ΑΤΣΤ) and
// individualised (ΕΞΣΤ) support, read from the timetable's support groups —
// including students who are not in the special-ed register. Full special-ed
// access only (the deputy responsible, the counselor, the headmaster).
export default async function SupportRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string; grade?: string; q?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canViewSpecialEdFull(auth.roles, !!staff?.specialEducation)) redirect(`/${locale}/teacher/special-ed`);

  const t = await getTranslations("specialEd");

  const all = supportRoster(await listSupportEnrolments());
  const kind = parseSupportKind(sp.kind);
  const gradeNum = sp.grade && /^[1-3]$/.test(sp.grade) ? Number(sp.grade) : undefined;
  const q = (sp.q ?? "").trim();
  const rows = filterSupportRoster(all, { kind, grade: gradeNum, q });

  const count = (k: SupportKind) => all.filter((r) => r.subjects[k].length > 0).length;
  const href = (over: { kind?: string | null; grade?: string | null }) => {
    const p = new URLSearchParams();
    const k = over.kind === undefined ? kind : over.kind;
    const g = over.grade === undefined ? (gradeNum ? String(gradeNum) : null) : over.grade;
    if (k) p.set("kind", k);
    if (g) p.set("grade", g);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/${locale}/teacher/special-ed/support${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) =>
    cn(
      "px-3 py-1 rounded-full border text-sm",
      active ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50",
    );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/teacher/special-ed`}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("supportRosterBack")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <LifeBuoy className="w-6 h-6 text-sky-600" />
          {t("supportRosterTitle")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">{t("supportRosterIntro")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SUPPORT_KINDS.map((k) => (
          <Link
            key={k}
            href={href({ kind: kind === k ? null : k })}
            className={cn(
              "rounded-xl border bg-white px-4 py-3 hover:bg-slate-50",
              kind === k ? "border-slate-800 ring-1 ring-slate-800" : "border-slate-200",
            )}
          >
            <p className="text-xs text-slate-500">{t(SUPPORT_KIND_LABEL_KEY[k])}</p>
            <p className="text-2xl font-bold text-slate-900">{count(k)}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ grade: null })} className={chip(!gradeNum)}>{t("supportAllGrades")}</Link>
        {[1, 2, 3].map((g) => (
          <Link key={g} href={href({ grade: String(g) })} className={chip(gradeNum === g)}>
            {t("supportGrade", { grade: g })}
          </Link>
        ))}
        <form action={`/${locale}/teacher/special-ed/support`} className="flex items-center gap-2 ml-auto">
          {kind && <input type="hidden" name="kind" value={kind} />}
          {gradeNum && <input type="hidden" name="grade" value={gradeNum} />}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              name="q"
              defaultValue={q}
              placeholder={t("supportSearch")}
              className="h-9 w-56 rounded-lg border border-slate-200 pl-8 pr-3 text-sm"
            />
          </div>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{all.length === 0 ? t("supportRosterEmpty") : t("supportRosterNoneFiltered")}</p>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3">{t("supportColStudent")}</th>
                  <th className="px-4 py-3">{t("supportColHomegroup")}</th>
                  {SUPPORT_KINDS.map((k) => (
                    <th key={k} className="px-4 py-3">{t(SUPPORT_KIND_LABEL_KEY[k])}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="border-b border-slate-50 last:border-0 align-top">
                    <td className="px-4 py-2.5">
                      {r.inRegister ? (
                        <Link
                          href={`/${locale}/teacher/special-ed/${r.studentId}`}
                          className="font-medium text-slate-900 hover:text-emerald-700"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{r.name}</span>
                      )}
                      <span className="block text-xs text-slate-400">
                        {r.registryNo}
                        {!r.inRegister && <> · {t("supportNotInRegister")}</>}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.homegroup ?? "—"}</td>
                    {SUPPORT_KINDS.map((k) => (
                      <td key={k} className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.subjects[k].map((s) => (
                            <Badge key={s} variant="outline" className={cn("text-xs", SUPPORT_KIND_BADGE[k])}>
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-slate-400">{t("supportShowing", { shown: rows.length, total: all.length })}</p>
    </div>
  );
}
