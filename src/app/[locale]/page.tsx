import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { getPortalForRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";

export default async function LocaleRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const portal = getPortalForRole(session.user.role as Role);
  redirect(`/${locale}/${portal}`);
}
