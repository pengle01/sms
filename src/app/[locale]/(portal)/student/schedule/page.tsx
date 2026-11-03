import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PrintTimetableLink } from "@/components/timetable/PrintTimetableLink";
import { StudentWeekTimetable } from "@/components/timetable/StudentWeekTimetable";

export default async function StudentSchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/student`);

  const student = await db.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: { group: true, subjectGroups: { select: { groupId: true } } },
  });
  if (!student) redirect(`/${locale}/login/student`);

  const t = await getTranslations("mySchedule");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
          <p className="text-slate-500 text-sm mt-1">{student.group?.name ?? t("noGroup")}</p>
        </div>
        {(student.groupId || student.subjectGroups.length > 0) && <PrintTimetableLink kind="student" value={student.id} />}
      </div>
      <StudentWeekTimetable
        locale={locale}
        student={{
          id: student.id,
          groupId: student.groupId,
          groupName: student.group?.name ?? null,
          subjectGroupIds: student.subjectGroups.map((sg) => sg.groupId),
        }}
      />
    </div>
  );
}
