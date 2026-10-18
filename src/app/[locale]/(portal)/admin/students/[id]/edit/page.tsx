import { EditStudentForm } from "@/components/students/EditStudentForm";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <EditStudentForm locale={locale} id={id} portal="admin" />;
}
