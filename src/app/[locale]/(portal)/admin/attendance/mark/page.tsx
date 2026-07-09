import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getNow, utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
  let existingRecords: Record<string, { status: "PRESENT" | "ABSENT" | "LATE"; minutesDelayed: number }> = {};

  if (groupId && period) {
    const today = getNow();
    const dayOfWeek = today.getDay();
    const todayMidnight = utcMidnight();

    const [fetchedStudents, fetchedSlot] = await Promise.all([
      db.studentProfile.findMany({
        where: {
          OR: [
            { groupId },
            { subjectGroups: { some: { groupId } } },
          ],
          user: { isActive: true },
        },
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

    if (slot && students.length > 0) {
      const marked = await db.attendance.findMany({
        where: {
          timetableSlotId: slot.id,
          date: todayMidnight,
          studentId: { in: students.map((s) => s.id) },
        },
        select: { studentId: true, status: true, minutesDelayed: true },
      });
      for (const r of marked) {
        existingRecords[r.studentId] = {
          status: (r.status === "EXCUSED" ? "ABSENT" : r.status) as "PRESENT" | "ABSENT" | "LATE",
          minutesDelayed: r.minutesDelayed,
        };
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/admin/attendance`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Απουσίες
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">Καταχώρηση Απουσιών</h2>
        <p className="text-slate-500 text-sm mt-1">
          {fmtDisplayDate(getNow())}
        </p>
      </div>

      <AttendanceMarkForm
        groups={groups}
        students={students}
        slot={slot}
        staffId={staff?.id ?? ""}
        selectedGroupId={groupId}
        selectedPeriod={period}
        existingRecords={existingRecords}
      />
    </div>
  );
}
