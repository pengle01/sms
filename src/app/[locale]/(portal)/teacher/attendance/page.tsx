import { redirect } from "next/navigation";

export default async function TeacherAttendancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/teacher/attendance/schedule`);
}
