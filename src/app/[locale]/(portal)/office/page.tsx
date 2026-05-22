import { redirect } from "next/navigation";

export default async function OfficePortalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/office/dashboard`);
}
