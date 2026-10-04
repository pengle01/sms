import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NotebookPen, Lock, Search } from "lucide-react";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { fmtDisplayDate } from "@/lib/dates";
import { filterNotes, registerFor, type RegisterRow } from "@/lib/lessonNotes";
import { suggestionList } from "@/lib/textSearch";
import { SuggestInput } from "@/components/SuggestInput";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteNoteButton } from "./DeleteNoteButton";

/**
 * The teacher's own private lesson notes, newest first, each with that
 * lesson's absent and late students from its register. Nobody else sees them.
 */
export default async function LessonNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; group?: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth || !auth.roles.some(isEducator)) redirect(`/${locale}/login/staff`);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const group = sp.group?.trim() || "";

  const t = await getTranslations("lessonNotes");
  const tc = await getTranslations("common");

  const all = await db.lessonNote.findMany({
    where: { authorId: auth.userId },
    orderBy: [{ date: "desc" }, { period: "desc" }],
    take: 1000,
  });
  const groups = [...new Set(all.map((n) => n.groupName))].sort((a, b) => a.localeCompare(b, "el", { numeric: true }));
  const notes = filterNotes(group ? all.filter((n) => n.groupName === group) : all, q);

  // The registers behind the shown notes, in one query: absent / late rows on
  // those dates for those classes (regular lessons and intercalary registers).
  const dates = [...new Set(notes.map((n) => n.date.getTime()))].map((ms) => new Date(ms));
  const groupIds = [...new Set(notes.map((n) => n.groupId))];
  const rawRows = notes.length
    ? await db.attendance.findMany({
        where: {
          date: { in: dates },
          OR: [{ status: "ABSENT" }, { status: "LATE" }, { isAutoAbsent: true }],
          AND: [{ OR: [{ timetableSlot: { groupId: { in: groupIds } } }, { intercalaryGroupId: { in: groupIds } }] }],
        },
        select: {
          date: true, status: true, isAutoAbsent: true, waived: true,
          intercalaryGroupId: true, intercalaryPeriod: true,
          timetableSlot: { select: { groupId: true, period: true } },
          student: { select: { user: { select: { name: true } } } },
        },
      })
    : [];
  const rows: RegisterRow[] = rawRows.map((r) => ({
    dateIso: r.date.toISOString().slice(0, 10),
    status: r.status,
    isAutoAbsent: r.isAutoAbsent,
    waived: r.waived,
    studentName: r.student.user?.name ?? "—",
    slotGroupId: r.timetableSlot?.groupId ?? null,
    slotPeriod: r.timetableSlot?.period ?? null,
    intercalaryGroupId: r.intercalaryGroupId,
    intercalaryPeriod: r.intercalaryPeriod,
  }));

  const pill = (active: boolean) =>
    `h-8 px-3 inline-flex items-center rounded-lg border text-sm transition-colors ${
      active ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
    }`;
  const href = (g: string) => {
    const p = new URLSearchParams();
    if (g) p.set("group", g);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <NotebookPen className="w-6 h-6" />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" />
          {t("subtitle")}
        </p>
      </div>

      {all.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <form method="GET" className="relative w-64 max-w-full">
            {group && <input type="hidden" name="group" value={group} />}
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <SuggestInput
              name="q"
              defaultValue={q}
              minChars={2}
              placeholder={t("searchPlaceholder")}
              suggestions={suggestionList(all.flatMap((n) => [n.groupName, n.courseName]))}
              className="w-full h-8 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </form>
          <Link href={href("")} className={pill(!group)}>{t("allClasses")}</Link>
          {groups.map((g) => (
            <Link key={g} href={href(g === group ? "" : g)} className={pill(g === group)}>{g}</Link>
          ))}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">{all.length === 0 ? t("empty") : t("noMatches")}</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const dateIso = n.date.toISOString().slice(0, 10);
            const reg = registerFor({ groupId: n.groupId, period: n.period, dateIso }, rows);
            return (
              <Card key={n.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">{fmtDisplayDate(n.date)}</span>
                        {" · "}{tc("periodShort", { period: n.period })}
                        {" · "}<span className="font-semibold text-slate-700">{n.groupName}</span>
                        {n.courseName ? ` · ${n.courseName}` : ""}
                      </p>
                      <p className="mt-1.5 text-sm text-slate-800 whitespace-pre-wrap break-words">{n.body}</p>
                      <div className="mt-2 space-y-0.5 text-xs">
                        {reg.absent.length > 0 && (
                          <p className="text-red-700">
                            <span className="font-semibold">{t("absentLabel")}:</span> {reg.absent.join(", ")}
                          </p>
                        )}
                        {reg.late.length > 0 && (
                          <p className="text-amber-700">
                            <span className="font-semibold">{t("lateLabel")}:</span> {reg.late.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Link
                        href={`/${locale}/teacher/attendance/mark?groupId=${n.groupId}&period=${n.period}&date=${dateIso}`}
                        className="text-xs text-emerald-700 hover:underline"
                      >
                        {t("openLesson")}
                      </Link>
                      <DeleteNoteButton id={n.id} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
