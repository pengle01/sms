import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { GRADE_PERIODS, parseGradePeriod } from "@/lib/grades";
import { getGradesUnlocked } from "@/lib/schoolConfig";
import { isManagement } from "@/lib/rbac";
import { parseSupportGroup } from "@/lib/specialEd";
import { Lock } from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { GradeEntryForm } from "./GradeEntryForm";

export default async function LessonGradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; groupId: string; courseId: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const { locale, groupId, courseId } = await params;
  const { term } = await searchParams;
  const period = parseGradePeriod(term);

  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect(`/${locale}/teacher/grades`);

  const role = session.user.role as Role;

  // Authorize: the teacher must actually teach this (group, course); management
  // may grade any lesson.
  const teaches = await db.timetableSlot.findFirst({
    where: { staffId: staff.id, groupId, courseId },
    select: { id: true },
  });
  if (!teaches && !isManagement(role)) notFound();

  const [group, course, gradesUnlocked] = await Promise.all([
    db.group.findUnique({ where: { id: groupId }, select: { name: true } }),
    db.course.findUnique({ where: { id: courseId }, select: { name: true } }),
    getGradesUnlocked(),
  ]);
  if (!group || !course) notFound();
  // Support lessons (ΣΤ_… / ΑΣΤ_…) are not graded — block direct/bookmarked
  // access to their grade-entry form, mirroring the filtered lesson list.
  if (parseSupportGroup(group.name)) redirect(`/${locale}/teacher/grades`);
  const locked = !gradesUnlocked[period];

  const t = await getTranslations("grades");

  // Students of this lesson: homeroom members of the group plus subject-enrolled.
  const students = await db.studentProfile.findMany({
    where: {
      OR: [{ groupId }, { subjectGroups: { some: { groupId } } }],
      user: { isActive: true },
    },
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const existing = await db.grade.findMany({
    where: { courseId, period, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true, value: true },
  });
  const gradeMap = new Map(existing.map((g) => [g.studentId, g.value]));

  const PERIOD_LABEL: Record<string, string> = {
    TERM1: t("term1"),
    TERM2: t("term2"),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/teacher/grades`}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{course.name}</h2>
            <p className="text-slate-500 text-sm mt-1">{group.name} · {t("scale")}</p>
          </div>
          <Badge variant="outline" className="text-xs mt-1">{group.name}</Badge>
        </div>
      </div>

      {/* Term tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {GRADE_PERIODS.map((p) => (
          <Link
            key={p}
            href={`?term=${p}`}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              period === p
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </div>

      {locked && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          <Lock className="w-4 h-4 flex-shrink-0 text-slate-400" />
          {t("lockedNotice")}
        </div>
      )}

      {students.length === 0 ? (
        <p className="text-sm text-slate-400">{t("noStudents")}</p>
      ) : (
        <GradeEntryForm
          courseId={courseId}
          groupId={groupId}
          period={period}
          locked={locked}
          students={students.map((s) => {
            const v = gradeMap.get(s.id);
            return {
              id: s.id,
              name: s.user?.name ?? s.id,
              existingValue: v != null ? String(Number(v)) : "",
            };
          })}
          labels={{
            saveAll: t("saveAll"),
            saved: t("saved"),
            colStudent: t("colStudent"),
            colScore: t("colScore"),
            invalidGrade: t("invalidGrade"),
          }}
        />
      )}
    </div>
  );
}
