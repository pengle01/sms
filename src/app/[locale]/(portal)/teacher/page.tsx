import { redirect } from "next/navigation";

export default async function TeacherPortalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/teacher/dashboard`);
}
