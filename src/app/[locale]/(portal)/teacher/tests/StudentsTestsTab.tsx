import { getTranslations } from "next-intl/server";
import { AlertTriangle, CalendarCheck } from "lucide-react";
import { db } from "@/server/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import { testAudience, audienceGroupIds, type TaughtStudent } from "@/lib/studentTests";
import { cn } from "@/lib/utils";

/**
 * «Διαγωνίσματα των μαθητών μου»: other teachers' upcoming tests that students
 * in the viewer's groups sit — the schedule only, no grades. A test that only
 * some of a group's students sit (an elective) is flagged, with their names.
 */
export async function StudentsTestsTab({ staffId, today }: { staffId: string; today: Date }) {
  const t = await getTranslations("tests");

  const mySlots = await db.timetableSlot.findMany({
    where: { staffId },
    select: { groupId: true, group: { select: { name: true } } },
  });
  const groupName = new Map(mySlots.map((s) => [s.groupId, s.group.name]));
  const myGroupIds = [...groupName.keys()].sort((a, b) =>
    groupName.get(a)!.localeCompare(groupName.get(b)!, "el")
  );

  const studentRows = myGroupIds.length
    ? await db.studentProfile.findMany({
        where: {
          user: { isActive: true },
          OR: [{ groupId: { in: myGroupIds } }, { subjectGroups: { some: { groupId: { in: myGroupIds } } } }],
        },
        select: {
          id: true,
          groupId: true,
          user: { select: { name: true } },
          subjectGroups: { select: { groupId: true } },
        },
      })
    : [];
  const students: TaughtStudent[] = studentRows.map((s) => ({
    id: s.id,
    groupIds: [...(s.groupId ? [s.groupId] : []), ...s.subjectGroups.map((g) => g.groupId)],
  }));
  const studentName = new Map(studentRows.map((s) => [s.id, s.user?.name ?? ""]));

  const tests = students.length
    ? await db.testSchedule.findMany({
        where: {
          date: { gte: today },
          staffId: { not: staffId }, // my own tests are on the first tab
          groupId: { in: audienceGroupIds(students) },
        },
        include: {
          course: { select: { name: true } },
          group: { select: { name: true } },
          staff: { select: { scheduleName: true, user: { select: { name: true } } } },
        },
        orderBy: [{ date: "asc" }, { period: "asc" }],
      })
    : [];

  const DOW = t.raw("dow") as string[];
  const th = "text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide";

  if (myGroupIds.length === 0) {
    return <p className="text-slate-400 text-sm">{t("studentsNoGroups")}</p>;
  }
  if (tests.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">{t("studentsNone")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{t("studentsIntro")}</p>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>{t("colDate")}</th>
                <th className={th}>{t("colPeriod")}</th>
                <th className={th}>{t("colSubject")}</th>
                <th className={th}>{t("colTeacher")}</th>
                <th className={th}>{t("colType")}</th>
                <th className={th}>{t("colMyStudents")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tests.map((test, idx) => {
                const rows = testAudience(test.groupId, myGroupIds, students);
                const anyPartial = rows.some((r) => r.partial);
                return (
                  <tr key={test.id} className={cn("align-top", idx % 2 === 1 && "bg-slate-50")}>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {DOW[test.date.getUTCDay()]} {fmtDisplayDate(test.date)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {test.periodCount > 1 ? `P${test.period}–${test.period + test.periodCount - 1}` : `P${test.period}`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {test.course.name}
                      <span className="block text-xs text-slate-400">{test.group.name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{staffDisplayName(test.staff)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={test.type === "BIG"
                          ? "text-xs bg-slate-800 text-white border-slate-800"
                          : "text-xs bg-slate-100 text-slate-600 border-slate-200"}
                      >
                        {test.type === "BIG" ? t("typeBigShort") : t("typeSmallShort")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 space-y-1">
                      {anyPartial && (
                        <p className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {t("partialMark")}
                        </p>
                      )}
                      {rows.map((r) =>
                        r.partial ? (
                          <details key={r.groupId} className="text-xs">
                            <summary className="cursor-pointer text-amber-800">
                              <span className="font-medium">{groupName.get(r.groupId)}</span>
                              {" · "}
                              {t("someStudents", { count: r.studentIds.length, total: r.total })}
                            </summary>
                            <ul className="mt-1 ml-4 list-disc text-slate-600">
                              {r.studentIds
                                .map((id) => studentName.get(id) ?? "")
                                .sort((a, b) => a.localeCompare(b, "el"))
                                .map((name, i) => <li key={i}>{name}</li>)}
                            </ul>
                          </details>
                        ) : (
                          <p key={r.groupId} className="text-xs text-slate-600">
                            <span className="font-medium">{groupName.get(r.groupId)}</span>
                            {" · "}
                            {t("wholeGroup")}
                          </p>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
