import { redirect } from "next/navigation";

export default async function ChaperoneRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/chaperone/students`);
}
