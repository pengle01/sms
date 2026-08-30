import { NoticeBoard } from "@/components/notices/NoticeBoard";

export default async function AdminNoticeboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <NoticeBoard locale={locale} />;
}
