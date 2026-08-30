import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { AccountPanel } from "@/components/account/AccountPanel";

/** My account — details and password change. */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(`/${locale}/login/staff`);
  if (!["CHAPERONE"].includes(session.user.role)) redirect(`/${locale}/login/staff`);

  return <AccountPanel userId={session.user.id} />;
}
