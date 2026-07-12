import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Download, CheckCircle2, AlertCircle, Search, Eraser, RotateCcw, CalendarDays } from "lucide-react";
import { utcMidnight, localDateStr, toAppTimeline, fromAppTimeline } from "@/lib/dates";
import { studentNameOrIdWhere } from "@/lib/studentSearch";
import { substitutionKinds } from "@/server/attendanceReport";
import { ReferralTabs } from "@/components/referrals/ReferralTabs";
import { toggleWaivedAction } from "./actions";
import { AttendanceFilters } from "./Filters";

export default async function OfficeAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; groupId?: string; days?: string; sq?: string; student?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("officeAttendance");
  const { date: dateStr, groupId, days: daysStr, sq, student: studentParam } = await searchParams;

  const todayStr = localDateStr();
  const today = utcMidnight(todayStr);
  const daysWindow = Math.min(60, Math.max(1, parseInt(daysStr ?? "14") || 14));

  // The report is organised by the day the absence was FILED (createdAt),
  // not the day it refers to — retroactive entries appear under the filing
  // day, explicitly labelled with the day they are for. A specific date
  // narrows to that single filing day; otherwise the last N filing days.
  const fromKey = dateStr ?? localDateStr(new Date(today.getTime() - (daysWindow - 1) * 24 * 60 * 60 * 1000));
  const toKey = dateStr ?? todayStr;
  // Cyprus local day of a timestamp (createdAt is stored in UTC)
  const filingDay = (d: Date) => toAppTimeline(d).toLocaleDateString("en-CA", { timeZone: "Asia/Nicosia" });

  const [groups, absencesRaw, exports] = await Promise.all([
    db.group.findMany({ orderBy: [{ grade: "asc" }, { name: "asc" }] }),
    db.attendance.findMany({
      where: {
        // widened UTC window — bucketed precisely by local filing day below.
        // A picked date ALSO matches rows whose attendance date is that day,
        // wherever they were filed (they render under their filing section,
        // explicitly labelled as referring to another day).
        AND: [
          dateStr
            ? {
                OR: [
                  {
                    createdAt: {
                      gte: new Date(fromAppTimeline(utcMidnight(fromKey)).getTime() - 24 * 60 * 60 * 1000),
                      lt: new Date(fromAppTimeline(utcMidnight(toKey)).getTime() + 48 * 60 * 60 * 1000),
                    },
                  },
                  { date: utcMidnight(dateStr) },
                ],
              }
            : {
                createdAt: {
                  gte: new Date(fromAppTimeline(utcMidnight(fromKey)).getTime() - 24 * 60 * 60 * 1000),
                  lt: new Date(fromAppTimeline(utcMidnight(toKey)).getTime() + 48 * 60 * 60 * 1000),
                },
              },
          { OR: [{ status: "ABSENT" }, { status: "LATE" }, { isAutoAbsent: true }] },
        ],
        ...(groupId ? { student: { groupId } } : {}),
      },
      include: {
        student: { include: { user: { select: { name: true } }, group: true } },
        timetableSlot: { include: { course: true } },
        staff: { select: { id: true, scheduleName: true, user: { select: { name: true } } } },
        exitPermit: { select: { reason: true, fromPeriod: true } },
      },
      orderBy: [
        { date: "asc" },
        { student: { user: { name: "asc" } } },
        { timetableSlot: { period: "asc" } },
      ],
    }),
    // Download log (matching the active group filter); with a picked date the
    // visible filing sections can lie anywhere, so don't bound by day.
    db.attendanceExport.findMany({
      where: {
        ...(dateStr ? {} : { date: { gte: utcMidnight(fromKey), lte: utcMidnight(toKey) } }),
        groupId: groupId ?? null,
      },
      include: { user: { select: { name: true } } },
      orderBy: { downloadedAt: "desc" },
    }),
  ]);
  const absences = absencesRaw.filter((a) => {
    const k = filingDay(a.createdAt);
    if (dateStr) return k === dateStr || a.date.toISOString().slice(0, 10) === dateStr;
    return k >= fromKey && k <= toKey;
  });

  // Was a row marked by someone other than the lesson's own teacher — and why?
  const subKinds = await substitutionKinds(
    absences.map((a) => ({
      date: a.date,
      timetableSlotId: a.timetableSlotId,
      markerStaffId: a.staffId,
      slotStaffId: a.timetableSlot?.staffId ?? null,
    }))
  );

  // Group rows per FILING day (oldest first); inside a day keep them sorted
  // by the attendance date they refer to, then student/period.
  const byDay = new Map<string, typeof absences>();
  for (const a of absences) {
    const key = filingDay(a.createdAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(a);
  }
  const dayKeys = [...byDay.keys()].sort();

  // Latest download per day
  const latestExport = new Map<string, (typeof exports)[number]>();
  for (const e of exports) {
    const key = e.date.toISOString().slice(0, 10);
    if (!latestExport.has(key)) latestExport.set(key, e);
  }

  const dayLabel = (key: string) =>
    new Date(key + "T00:00:00Z").toLocaleDateString(locale === "en" ? "en-GB" : "el-GR", {
      weekday: "long", day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC",
    });
  const fmtDateTime = (d: Date) =>
    d.toLocaleString("el-GR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia",
    });

  const exportHref = (dayKey: string) =>
    `/${locale}/office/attendance/export?date=${dayKey}${groupId ? `&groupId=${groupId}` : ""}`;

  const subBadge = (a: (typeof absences)[number]) => {
    const kind = a.timetableSlotId
      ? subKinds.get(`${a.date.toISOString().slice(0, 10)}:${a.timetableSlotId}`)
      : undefined;
    if (!kind) return null;
    const label =
      kind === "STUDY_HALL" ? t("subHeadteacher") : kind === "CLAIM" ? t("subClaim") : t("subTeacher");
    return (
      <Badge
        variant="outline"
        className={
          kind === "STUDY_HALL"
            ? "ml-1.5 bg-sky-50 text-sky-700 border-sky-200"
            : kind === "CLAIM"
              ? "ml-1.5 bg-amber-50 text-amber-700 border-amber-200"
              : "ml-1.5 bg-sky-50 text-sky-700 border-sky-200"
        }
      >
        {label}
      </Badge>
    );
  };

  // One table of rows (no date clustering — the islands handle that)
  const dayTable = (tableRows: typeof absences) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colStudent")}</th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colGroup")}</th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colPeriod")}</th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colCourse")}</th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colStatus")}</th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colTeacher")}</th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colDelay")}</th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">SMS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {tableRows.map((a) => (
            <tr key={a.id} className={`hover:bg-slate-50 ${a.waived ? "opacity-60" : ""}`}>
              <td className={`px-5 py-2.5 font-medium text-slate-900 ${a.waived ? "line-through" : ""}`}>
                {a.student.user?.name}
              </td>
              <td className="px-5 py-2.5">
                <Badge variant="outline" className="text-xs">{a.student.group?.name ?? "—"}</Badge>
              </td>
              <td className="px-5 py-2.5 text-slate-600">{a.timetableSlot?.period ?? a.intercalaryPeriod ?? "—"}</td>
              <td className="px-5 py-2.5 text-slate-600">{a.timetableSlot?.course.name ?? "—"}</td>
              <td className="px-5 py-2.5">
                <Badge
                  variant="outline"
                  className={
                    a.status === "ABSENT"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }
                >
                  {a.isAutoAbsent ? t("autoAbsent") : a.status === "ABSENT" ? t("absent") : a.status === "LATE" ? t("late") : a.status}
                </Badge>
                {a.exitPermit && (
                  <Badge
                    variant="outline"
                    className="ml-1.5 bg-yellow-50 text-yellow-700 border-yellow-300"
                    title={a.exitPermit.reason}
                  >
                    {t("exitPermit")}
                  </Badge>
                )}
                {a.waived && (
                  <Badge variant="outline" className="ml-1.5 bg-slate-100 text-slate-500 border-slate-300">
                    {t("waived")}
                  </Badge>
                )}
              </td>
              <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">
                {a.staff.scheduleName ?? a.staff.user?.name ?? "—"}
                {subBadge(a)}
              </td>
              <td className="px-5 py-2.5 text-slate-500">
                {a.minutesDelayed > 0 ? `${a.minutesDelayed}′` : "—"}
              </td>
              <td className="px-5 py-2.5">
                {a.smsSent ? (
                  <span className="text-xs text-green-600 font-medium">{t("smsSent")}</span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Tab 1: the day-by-day log ─────────────────────────────────────────────
  const logContent = (
    <div className="space-y-5">
      {/* Filters — pick a date and the absences appear */}
      <AttendanceFilters
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        date={dateStr}
        groupId={groupId}
        todayStr={todayStr}
      />

      {dayKeys.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center text-slate-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
          {t("noEntries")}
        </div>
      )}

      {/* One section per day — oldest first, clearly separated */}
      {dayKeys.map((dayKey) => {
        const rows = byDay.get(dayKey)!;
        const exp = latestExport.get(dayKey);
        const newSince = exp ? rows.filter((r) => r.createdAt > exp.downloadedAt).length : 0;
        return (
          <section key={dayKey} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {/* Day banner */}
            <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 bg-slate-800 text-white">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold capitalize">{dayLabel(dayKey)}</span>
                <span className="text-xs text-slate-300">{t("entries", { count: rows.length })}</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Download status — the office's record of what was taken */}
                {exp ? (
                  newSince > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-1 text-xs font-medium text-amber-200">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {t("newSinceDownload", { count: newSince })}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 text-xs font-medium text-emerald-200"
                      title={exp.user.name ?? undefined}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("downloadedAt", { at: fmtDateTime(exp.downloadedAt), count: exp.records })}
                    </span>
                  )
                ) : (
                  <span className="text-xs text-slate-400">{t("notDownloaded")}</span>
                )}
                <a
                  href={exportHref(dayKey)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t("downloadCsv")}
                </a>
              </div>
            </div>

            {/* Islands: one per attendance date the filing day's rows refer to */}
            {(() => {
              const clusters: { key: string; rows: typeof rows }[] = [];
              for (const a of rows) {
                const k = a.date.toISOString().slice(0, 10);
                const last = clusters[clusters.length - 1];
                if (last && last.key === k) last.rows.push(a);
                else clusters.push({ key: k, rows: [a] });
              }
              const needIslands = clusters.length > 1 || clusters[0]!.key !== dayKey;
              if (!needIslands) return dayTable(rows);
              return (
                <div className="p-3 sm:p-4 space-y-3 bg-slate-100/70">
                  {clusters.map((c) => {
                    const other = c.key !== dayKey;
                    return (
                      <div
                        key={c.key}
                        className={`rounded-xl border bg-white overflow-hidden ${other ? "border-violet-300" : "border-slate-200"}`}
                      >
                        <div
                          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold capitalize ${
                            other ? "bg-violet-50 text-violet-700" : "bg-slate-50 text-slate-600"
                          }`}
                        >
                          <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                          {other ? t("forOtherDay", { date: dayLabel(c.key) }) : t("forSameDay", { date: dayLabel(c.key) })}
                          <span className={`normal-case font-normal ${other ? "text-violet-400" : "text-slate-400"}`}>
                            {t("entries", { count: c.rows.length })}
                          </span>
                        </div>
                        {dayTable(c.rows)}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        );
      })}
    </div>
  );

  // ── Tab 2: soft-erase (διαγραφή) absences ────────────────────────────────
  const eraseQuery = (sq ?? "").trim();
  const [eraseMatches, eraseStudent] = await Promise.all([
    eraseQuery && !studentParam
      ? db.studentProfile.findMany({
          where: { ...studentNameOrIdWhere(eraseQuery), user: { isActive: true } },
          include: { user: { select: { name: true } }, group: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
          take: 20,
        })
      : Promise.resolve([]),
    studentParam
      ? db.studentProfile.findUnique({
          where: { id: studentParam },
          include: {
            user: { select: { name: true } },
            group: { select: { name: true } },
            attendance: {
              where: { OR: [{ status: "ABSENT" }, { isAutoAbsent: true }] },
              include: { timetableSlot: { include: { course: { select: { name: true } } } } },
              orderBy: [{ date: "desc" }, { timetableSlot: { period: "asc" } }],
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const backUrl = `/${locale}/office/attendance?${new URLSearchParams({
    ...(eraseQuery ? { sq: eraseQuery } : {}),
    ...(studentParam ? { student: studentParam } : {}),
  }).toString()}`;

  const eraseContent = (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-slate-500">{t("eraseHint")}</p>

      {/* Student search */}
      <form method="GET" className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            name="sq"
            defaultValue={eraseQuery}
            placeholder={t("eraseSearch")}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button type="submit" className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          {t("apply")}
        </button>
      </form>

      {/* Matches */}
      {eraseMatches.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-50 overflow-hidden">
          {eraseMatches.map((s) => (
            <Link
              key={s.id}
              href={`?sq=${encodeURIComponent(eraseQuery)}&student=${s.id}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-emerald-50/40"
            >
              <span className="font-medium text-slate-900">{s.user?.name}</span>
              <span className="text-xs text-slate-400">{s.group?.name}</span>
              <span className="text-xs font-mono text-slate-400 ml-auto">{s.studentId}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Selected student's absences */}
      {eraseStudent && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-slate-800 text-white flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-bold">
              {eraseStudent.user?.name}
              <span className="ml-2 font-normal text-slate-300">
                {eraseStudent.group?.name} · {eraseStudent.studentId}
              </span>
            </span>
            <span className="text-xs text-slate-300">
              {t("eraseTotals", {
                counted: eraseStudent.attendance.filter((a) => !a.waived).length,
                waived: eraseStudent.attendance.filter((a) => a.waived).length,
              })}
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {eraseStudent.attendance.map((a) => (
              <div key={a.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${a.waived ? "bg-slate-50/60" : ""}`}>
                <span className={`w-20 text-xs text-slate-500 ${a.waived ? "line-through" : ""}`}>
                  {a.date.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" })}
                </span>
                <span className="w-8 text-xs text-slate-500">Π{a.timetableSlot?.period ?? a.intercalaryPeriod ?? "—"}</span>
                <span className={`flex-1 min-w-0 truncate ${a.waived ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {a.timetableSlot?.course.name ?? "—"}
                </span>
                {a.waived ? (
                  <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-300">{t("waived")}</Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    {a.isAutoAbsent ? t("autoAbsent") : t("absent")}
                  </Badge>
                )}
                <form action={toggleWaivedAction}>
                  <input type="hidden" name="attendanceId" value={a.id} />
                  <input type="hidden" name="back" value={backUrl} />
                  <button
                    type="submit"
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      a.waived
                        ? "border-slate-200 text-slate-500 hover:text-emerald-700 hover:border-emerald-300"
                        : "border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-300"
                    }`}
                  >
                    {a.waived ? <RotateCcw className="w-3.5 h-3.5" /> : <Eraser className="w-3.5 h-3.5" />}
                    {a.waived ? t("eraseUndo") : t("eraseDo")}
                  </button>
                </form>
              </div>
            ))}
            {eraseStudent.attendance.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">{t("eraseNone")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {dateStr ? dayLabel(dateStr) : t("windowLabel", { days: daysWindow })}
          {" · "}
          {t("entries", { count: absences.length })}
          {" · "}
          {t("basedOnFiling")}
        </p>
      </div>

      <ReferralTabs
        initialKey={sq || studentParam ? "erase" : "log"}
        tabs={[
          { key: "log", label: t("tabLog"), content: logContent },
          { key: "erase", label: t("tabErase"), content: eraseContent },
        ]}
      />
    </div>
  );
}
