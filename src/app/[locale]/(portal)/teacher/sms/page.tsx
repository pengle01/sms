import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isManagement } from "@/lib/rbac";
import { SmsConsole } from "./SmsConsole";

export default async function TeacherSmsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  // SMS broadcasting is a management function (headmaster + headteachers).
  if (!auth.roles.some((r) => isManagement(r))) redirect(`/${locale}/teacher/dashboard`);

  return <SmsConsole />;
}
