import { redirect } from "next/navigation";
import { DateInput } from "@/components/ui/date-input";
import Link from "next/link";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { getCoordinatorStaff } from "@/server/substitutions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import { isPoolEligible } from "@/lib/substitutions";
import { ChevronLeft, Printer, Sparkles, CheckCircle2, Info, Trash2 } from "lucide-react";
import {
  generatePlanAction,
  finalizePlanAction,
  overrideSubstitute,
  deletePlanEntry,
  updateQuota,
} from "./actions";

const KIND_LABEL: Record<string, string> = {
  COVER: "Αναπλήρωση",
  SWAP: "Αλλαγή ώρας",
  STUDY_HALL: "Φ/δι εφημ ΒΔ",
  RELEASE: "Αποχώρηση τμήματος",
  ROOM_CHANGE: "Αλλαγή αίθουσας",
  SUPPORT_MERGE: "Στήριξη → τάξη",
};

export default async function SubstitutionPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; error?: string; finalized?: string; tab?: string }>;
}) {
  const { locale } = await params;
  const { date: dateParam, error, finalized, tab } = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const coordinator = await getCoordinatorStaff(auth.userId);
  if (!coordinator) redirect(`/${locale}/teacher/substitutions`);

  const dateStr = dateParam ?? localDateStr();
  const date = utcMidnight(dateStr);

  const [plan, requests, allStaff] = await Promise.all([
    db.substitutionPlan.findUnique({
      where: { date },
      include: {
        entries: {
          include: {
            group: { select: { name: true } },
            absentStaff: { select: { scheduleName: true, user: { select: { name: true } } } },
            substituteStaff: { select: { scheduleName: true, user: { select: { name: true } } } },
            timetableSlot: { include: { course: { select: { name: true } } } },
          },
          orderBy: [{ kind: "asc" }, { period: "asc" }],
        },
      },
    }),
    db.substitutionRequest.findMany({
      where: {
        OR: [
          { startDate: date },
          { AND: [{ startDate: { lte: date } }, { endDate: { gte: date } }] },
        ],
      },
      include: { staff: { select: { scheduleName: true, user: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.staffProfile.findMany({
      where: { userId: { not: null }, user: { is: { isActive: true } } },
      select: { id: true, scheduleName: true, maxSubstitutions: true, user: { select: { name: true } } },
      orderBy: { scheduleName: "asc" },
    }),
  ]);

  const isDraft = plan?.status === "DRAFT";
  const entries = plan?.entries ?? [];
  const covers = entries.filter((e) => e.kind === "COVER" || e.kind === "SWAP");
  const studyHalls = entries.filter((e) => e.kind === "STUDY_HALL");
  const releases = entries.filter((e) => e.kind === "RELEASE");
  const roomChanges = entries.filter((e) => e.kind === "ROOM_CHANGE");
  const supportMerges = entries.filter((e) => e.kind === "SUPPORT_MERGE");

  const eligibleOptions = allStaff.filter((s) =>
    isPoolEligible(s.scheduleName, s.maxSubstitutions)
  );

  const generateAction = generatePlanAction.bind(null, locale, dateStr);
  const finalizeAction = finalizePlanAction.bind(null, locale, dateStr);

  const sectionCard = (title: string, rows: typeof entries, renderActions: boolean) =>
    rows.length === 0 ? null : (
      <Card key={title}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {title} ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-50">
              {rows.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-4 py-2.5 w-12 font-semibold text-slate-700 whitespace-nowrap">
                    {e.period != null ? `Π${e.period}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{e.group?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-500">
                    {e.absentStaff ? staffDisplayName(e.absentStaff) : "—"}
                    {e.timetableSlot?.course.name && (
                      <span className="block text-xs text-slate-400">{e.timetableSlot.course.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {e.substituteStaff ? (
                      <span className="font-medium text-slate-900">{staffDisplayName(e.substituteStaff)}</span>
                    ) : (
                      <span className="text-slate-400">{KIND_LABEL[e.kind]}</span>
                    )}
                    {e.newRoom && <span className="ml-2 text-xs text-slate-400">αίθ. {e.newRoom}</span>}
                    {e.note && <span className="block text-xs text-slate-400">{e.note}</span>}
                    {e.rankInfo && (
                      <span className="mt-0.5 flex items-start gap-1 text-xs text-sky-700">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        {e.rankInfo}
                      </span>
                    )}
                  </td>
                  {renderActions && isDraft && (
                    <td className="px-3 py-2.5 w-64">
                      <div className="flex items-center gap-1.5">
                        <form action={overrideSubstitute.bind(null, locale, dateStr, e.id)} className="flex items-center gap-1.5">
                          <select
                            name="staffId"
                            defaultValue={e.substituteStaffId ?? ""}
                            className="h-7 px-1.5 rounded-lg border border-slate-200 text-xs bg-white max-w-40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="">Φ/δι εφημ ΒΔ</option>
                            {eligibleOptions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {staffDisplayName(s, s.id)}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="h-7 px-2 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-700">
                            ΟΚ
                          </button>
                        </form>
                        <form action={deletePlanEntry.bind(null, locale, dateStr, e.id)}>
                          <button type="submit" aria-label="Διαγραφή" className="h-7 w-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${locale}/teacher/substitutions`}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Αναπληρώσεις
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Πλάνο Αναπληρώσεων</h2>
            <p className="text-slate-500 text-sm mt-1">
              {fmtDisplayDate(date)}
              {plan && (
                <Badge
                  variant="outline"
                  className={`ml-2 text-xs ${
                    plan.status === "FINAL"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {plan.status === "FINAL" ? "Οριστικό" : "Πρόχειρο"}
                </Badge>
              )}
            </p>
          </div>
          {plan && (
            <Link
              href={`/${locale}/teacher/substitutions/plan/${dateStr}/print`}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Printer className="w-4 h-4" />
              Εκτύπωση
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error === "weekend" ? "Σαββατοκύριακο — δεν υπάρχει πρόγραμμα." : "Κάτι πήγε στραβά."}
        </div>
      )}
      {finalized && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          Το πλάνο οριστικοποιήθηκε — οι αναπληρωτές ειδοποιήθηκαν και τα προγράμματα ενημερώθηκαν.
        </div>
      )}

      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap">
        <form method="GET" className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Ημερομηνία</label>
            <DateInput
              name="date"
              defaultValue={dateStr}
              className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button type="submit" className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Μετάβαση
          </button>
        </form>
        <form action={generateAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            <Sparkles className="w-4 h-4" />
            {plan ? "Επαναδημιουργία" : "Δημιουργία πλάνου"}
          </button>
        </form>
        {isDraft && (
          <form action={finalizeAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700"
            >
              <CheckCircle2 className="w-4 h-4" />
              Οριστικοποίηση
            </button>
          </form>
        )}
      </div>

      {/* Requests for the day */}
      {requests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Αιτήματα ημέρας ({requests.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-50">
            {requests.map((r) => (
              <div key={r.id} className="py-2 text-sm flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-800">{staffDisplayName(r.staff)}</span>
                <Badge variant="outline" className="text-xs">
                  {r.type === "ABSENCE" ? "Απουσία" : r.type === "EXEMPTION" ? "Εξαίρεση" : "Αλλαγή αίθουσας"}
                </Badge>
                {r.periods.length > 0 && <span className="text-xs text-slate-500">Π: {r.periods.join(", ")}</span>}
                {r.endDate && (
                  <span className="text-xs text-slate-500">
                    έως {fmtDisplayDate(r.endDate)}
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  {r.reason}
                  {r.reasonDetails && ` — ${r.reasonDetails}`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!plan && (
        <p className="text-sm text-slate-400">
          Δεν έχει δημιουργηθεί πλάνο για αυτή την ημερομηνία.
        </p>
      )}

      {sectionCard("Α. Αναπληρώσεις", covers, true)}
      {sectionCard("Φ/δι εφημερεύοντος ΒΔ", studyHalls, true)}
      {sectionCard("Β. Τμήματα που αποχωρούν", releases, false)}
      {sectionCard("Γ. Αλλαγές αίθουσας", roomChanges, false)}
      {sectionCard("Στήριξη", supportMerges, false)}

      {/* Quotas */}
      <details open={tab === "quotas"}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-600 select-none">
          Ποσοστώσεις αναπληρώσεων (max ανά εκπαιδευτικό)
        </summary>
        <Card className="mt-2 max-w-xl">
          <CardContent className="p-0 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-50">
                {allStaff.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-slate-700">{staffDisplayName(s, s.id)}</td>
                    <td className="px-4 py-2 w-40">
                      <form action={updateQuota.bind(null, locale, s.id)} className="flex items-center gap-1.5">
                        <input
                          type="number"
                          name="max"
                          min={0}
                          defaultValue={s.maxSubstitutions ?? ""}
                          placeholder="∞"
                          className="w-16 h-7 px-2 rounded-lg border border-slate-200 text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button type="submit" className="h-7 px-2 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
                          ΟΚ
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </details>
    </div>
  );
}
