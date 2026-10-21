import { getTranslations } from "next-intl/server";
import { LoginForm } from "../LoginForm";
import { LoginShell, LOGIN_BACKGROUNDS, redirectIfSignedIn } from "../LoginShell";

// Parents & guardians only. Students: /login/student, staff: /login/staff.
export default async function ParentLoginPage({
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
    <LoginShell title={t("parentLoginTitle")} background={LOGIN_BACKGROUNDS.parent}>
      <LoginForm locale={locale} urlError={error} reason={reason} variant="parent" />
    </LoginShell>
  );
}
