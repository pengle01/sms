import { getTranslations } from "next-intl/server";
import { LoginForm } from "../LoginForm";
import { LoginShell, LOGIN_BACKGROUNDS, redirectIfSignedIn } from "../LoginShell";

// Teachers, office, chaperones, admins. Families: /login/parent, /login/student.
export default async function StaffLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; callbackUrl?: string; reason?: string }>;
}) {
  const { locale } = await params;
  const { error, reason } = await searchParams;
  await redirectIfSignedIn(locale);
  const t = await getTranslations("auth");

  return (
    <LoginShell title={t("staffLoginTitle")} background={LOGIN_BACKGROUNDS.staff}>
      <LoginForm locale={locale} urlError={error} reason={reason} variant="staff" />
    </LoginShell>
  );
}
