import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function TeacherGradesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const t = await getTranslations("grades");

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-400 text-sm">{t("noLessons")}</p>
      </div>
    );
  }

  // A teacher's lessons are the distinct (group, course) pairs they teach,
  // derived from their claimed timetable slots (same source as Tests).
  const slots = await db.timetableSlot.findMany({
    where: { staffId: staff.id },
    select: {
      groupId: true,
      courseId: true,
      group: { select: { name: true, grade: true } },
      course: { select: { name: true } },
    },
    orderBy: [
      { group: { grade: "asc" } },
      { group: { name: "asc" } },
      { course: { name: "asc" } },
    ],
  });

  const lessonMap = new Map<
    string,
    { groupId: string; courseId: string; groupName: string; grade: number; courseName: string }
  >();
  for (const s of slots) {
    const key = `${s.groupId}:${s.courseId}`;
    if (!lessonMap.has(key)) {
      lessonMap.set(key, {
        groupId: s.groupId,
        courseId: s.courseId,
        groupName: s.group.name,
        grade: s.group.grade,
        courseName: s.course.name,
      });
    }
  }
  const lessons = [...lessonMap.values()];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
      </div>

      {lessons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <BookOpen className="w-12 h-12 mb-3 opacity-30" />
          <p>{t("noLessons")}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {lessons.map((l) => (
                <Link
                  key={`${l.groupId}:${l.courseId}`}
                  href={`/${locale}/teacher/grades/${l.groupId}/${l.courseId}`}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{l.courseName}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{l.groupName}</Badge>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
