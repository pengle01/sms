import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, PenLine, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { canManageSpecialEdRegister } from "@/lib/specialEd";
import { splitTranscriberNeeds, testPeriods } from "@/lib/transcribers";
import { listTranscriberNeeds, listTranscribers, type TranscriberNeedRow } from "@/server/transcribers";
import { AssignTranscriber } from "./AssignTranscriber";
import { TranscriberListUpload } from "./TranscriberListUpload";

// «Μεταγραφείς»: every upcoming test sat by a student entitled to a
// transcriber (διευκόλυνση 7), with the teacher picked to write it — or the
// pick still to make, from the listed teachers free in the test's period(s).
// The deputy responsible for special education (headmaster/admin as fallback).
export default async function TranscribersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canManageSpecialEdRegister(auth.roles, !!staff?.specialEducation)) redirect(`/${locale}/teacher/special-ed`);

  const t = await getTranslations("transcribers");
  const tTests = await getTranslations("tests");
  const DOW = tTests.raw("dow") as string[];

  const [needs, list] = await Promise.all([listTranscriberNeeds(utcMidnight()), listTranscribers()]);
  const { pending, assigned } = splitTranscriberNeeds(needs);

  const periodsLabel = (n: TranscriberNeedRow) => {
    const p = testPeriods(n.period, n.periodCount);
    return p.length > 1 ? `Π${p[0]}–${p[p.length - 1]}` : `Π${p[0]}`;
  };

  const table = (rows: TranscriberNeedRow[]) => (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3">{t("colDate")}</th>
              <th className="px-4 py-3">{t("colTest")}</th>
              <th className="px-4 py-3">{t("colStudent")}</th>
              <th className="px-4 py-3">{t("colTranscriber")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={`${n.testId}:${n.studentId}`} className="border-b border-slate-50 last:border-0 align-top">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-medium text-slate-900">
                    {DOW[n.date.getUTCDay()]} {fmtDisplayDate(n.date)}
                  </span>
                  <span className="block text-xs text-slate-400">{periodsLabel(n)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-800">{n.courseName}</span>
                  <span className="block text-xs text-slate-500">
                    {n.groupName} · {n.teacherName} · {n.type === "BIG" ? tTests("typeBig") : tTests("typeSmall")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-900">{n.studentName}</span>
                  {n.homegroup && <span className="block text-xs text-slate-400">{n.homegroup}</span>}
                </td>
                <td className="px-4 py-3">
                  {n.assignment && (
                    <p className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{n.assignment.name}</span>
                      {n.assignment.room && (
                        <span className="text-xs text-slate-500 font-mono">{t("inRoom", { room: n.assignment.room })}</span>
                      )}
                      {n.assignment.roomTaken && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {t("roomTaken")}
                        </Badge>
                      )}
                      {n.assignment.busy && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {t(`busy_${n.assignment.busy}`)}
                        </Badge>
                      )}
                    </p>
                  )}
                  <AssignTranscriber
                    testId={n.testId}
                    studentId={n.studentId}
                    options={n.options}
                    rooms={n.rooms}
                    current={n.assignment?.staffId}
                    currentRoom={n.assignment?.room}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/teacher/special-ed`}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("back")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <PenLine className="w-6 h-6 text-sky-600" />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">{t("intro")}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {t("pending", { count: pending.length })}
        </p>
        {pending.length > 0 ? table(pending) : <p className="text-sm text-slate-400">{t("nonePending")}</p>}
      </div>

      {assigned.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {t("assigned", { count: assigned.length })}
          </p>
          {table(assigned)}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("listTitle", { count: list.length })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TranscriberListUpload />
          {list.length === 0 ? (
            <p className="text-sm text-slate-400">{t("listEmpty")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {list.map((s) => (
                <Badge key={s.id} variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-200">
                  {s.scheduleName ?? s.user?.name}
                  {s.transcriberPeriods != null && (
                    <span className="ml-1.5 text-slate-400">{t("optionPeriods", { count: s.transcriberPeriods })}</span>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
