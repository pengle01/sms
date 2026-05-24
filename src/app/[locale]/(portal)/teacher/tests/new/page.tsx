import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { TestForm } from "./TestForm";

export type Assignment = {
  groupId: string;
  groupName: string;
  courseId: string;
  courseName: string;
  slots: Array<{ dayOfWeek: number; period: number }>;
};

export default async function NewTestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect(`/${locale}/teacher/tests`);

  const slots = await db.timetableSlot.findMany({
    where: { staffId: staff.id },
    include: {
      group: { select: { id: true, name: true, grade: true } },
      course: { select: { id: true, name: true } },
    },
    orderBy: [
      { group: { grade: "asc" } },
      { group: { name: "asc" } },
      { course: { name: "asc" } },
      { dayOfWeek: "asc" },
      { period: "asc" },
    ],
  });

  // Group by (groupId, courseId), collecting all (dayOfWeek, period) pairs
  const assignmentMap = new Map<string, Assignment>();
  for (const s of slots) {
    const key = `${s.groupId}:${s.courseId}`;
    if (!assignmentMap.has(key)) {
      assignmentMap.set(key, {
        groupId: s.group.id,
        groupName: s.group.name,
        courseId: s.course.id,
        courseName: s.course.name,
        slots: [],
      });
    }
    assignmentMap.get(key)!.slots.push({ dayOfWeek: s.dayOfWeek, period: s.period });
  }

  const assignments = [...assignmentMap.values()];

  if (assignments.length === 0) {
    return (
      <div className="space-y-4">
        <Link href={`/${locale}/teacher/tests`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Tests
        </Link>
        <p className="text-slate-400 text-sm">You have no timetable slots assigned. Ask an administrator to set up your timetable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href={`/${locale}/teacher/tests`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Tests
      </Link>

      <h2 className="text-2xl font-bold text-slate-900">Schedule a Test</h2>

      <Card className="max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Test details</CardTitle>
        </CardHeader>
        <CardContent>
          <TestForm assignments={assignments} locale={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
