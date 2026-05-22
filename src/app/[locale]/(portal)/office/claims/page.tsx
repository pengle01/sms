import { redirect } from "next/navigation";

export default async function OfficeClaimsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/office/dashboard`);
}
