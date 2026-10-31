import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { db } from "@/server/db";
import { chaperoneNameKey } from "@/lib/chaperone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChaperoneListUpload } from "./ChaperoneListUpload";

/**
 * «Συνοδοί»: the uploaded list — each chaperone with their students and whether
 * an account with that name exists — and chaperone accounts whose name is on
 * no row (so the admin can match the spelling in the sheet).
 */
export async function ChaperoneListCard() {
  const t = await getTranslations("chaperoneAdmin");
  const [entries, accounts] = await Promise.all([
    db.chaperoneListEntry.findMany({
      select: {
        name: true,
        nameKey: true,
        student: { select: { id: true, studentId: true, user: { select: { name: true } }, group: { select: { name: true } } } },
      },
      orderBy: [{ name: "asc" }, { student: { user: { name: "asc" } } }],
    }),
    db.user.findMany({
      where: { role: "CHAPERONE" },
      select: { id: true, name: true, email: true, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const chaperones = new Map<string, { name: string; students: (typeof entries)[number]["student"][] }>();
  for (const e of entries) {
    const c = chaperones.get(e.nameKey) ?? { name: e.name, students: [] };
    c.students.push(e.student);
    chaperones.set(e.nameKey, c);
  }
  const accountsByKey = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const key = chaperoneNameKey(a.name);
    accountsByKey.set(key, [...(accountsByKey.get(key) ?? []), a]);
  }
  const unmatched = accounts.filter((a) => !chaperones.has(chaperoneNameKey(a.name)));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          {t("title", { count: chaperones.size })}
        </CardTitle>
        <p className="text-xs text-slate-500">{t("hint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChaperoneListUpload />
        {chaperones.size > 0 && (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
            {[...chaperones].map(([key, c]) => {
              const linked = accountsByKey.get(key) ?? [];
              return (
                <div key={key} className="px-4 py-2.5 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-slate-900">{c.name}</span>
                    {linked.length === 0 ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                        {t("noAccount")}
                      </span>
                    ) : (
                      linked.map((a) => (
                        <span
                          key={a.id}
                          className={
                            a.isActive
                              ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                              : "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
                          }
                        >
                          {a.isActive ? t("accountActive", { email: a.email }) : t("accountPending", { email: a.email })}
                        </span>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {c.students
                      .map((s) => [s.user.name ?? "—", s.group?.name, s.studentId].filter(Boolean).join(" · "))
                      .join("  |  ")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {unmatched.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-amber-800">{t("unmatchedTitle", { count: unmatched.length })}</p>
            <p className="text-xs text-amber-700">{t("unmatchedHint")}</p>
            <ul className="text-xs text-slate-700 space-y-0.5 pt-1">
              {unmatched.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.name ?? "—"}</span> · {a.email}
                  {!a.isActive && <span className="text-amber-700"> · {t("awaitingApproval")}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
