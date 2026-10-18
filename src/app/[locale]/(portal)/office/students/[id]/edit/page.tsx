// The secretary edits students with the same form as the admin.
import { EditStudentForm } from "@/components/students/EditStudentForm";

export default async function OfficeEditStudentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <EditStudentForm locale={locale} id={id} portal="office" />;
}
