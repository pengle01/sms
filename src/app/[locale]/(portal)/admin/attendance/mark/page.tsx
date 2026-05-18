import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { AttendanceMarkForm } from "./AttendanceMarkForm";

export default async function MarkAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; period?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { groupId, period: periodStr } = await searchParams;
  const period = periodStr ? parseInt(periodStr) : 1;

  const [groups, staff] = await Promise.all([
    db.group.findMany({ orderBy: [{ grade: "asc" }, { name: "asc" }] }),
    db.staffProfile.findUnique({ where: { userId: session.user.id } }),
  ]);

  let students: { id: string; user: { name: string | null }; studentId: string }[] = [];
  let slot: { id: string; room: string | null; course: { name: string } } | null = null;

  if (groupId && period) {
    const today = new Date();
    const dayOfWeek = today.getDay();

    const [fetchedStudents, fetchedSlot] = await Promise.all([
      db.studentProfile.findMany({
        where: { groupId },
        include: { user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      db.timetableSlot.findFirst({
        where: { groupId, period, dayOfWeek },
        include: { course: true },
      }),
    ]);
    students = fetchedStudents;
    slot = fetchedSlot;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Mark Attendance</h2>
        <p className="text-slate-500 text-sm mt-1">
          {new Date().toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <AttendanceMarkForm
        groups={groups}
        students={students}
        slot={slot}
        staffId={staff?.id ?? ""}
        selectedGroupId={groupId}
        selectedPeriod={period}
      />
    </div>
  );
}
