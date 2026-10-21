import { getTranslations } from "next-intl/server";
import { LoginForm } from "../LoginForm";
import { LoginShell, LOGIN_BACKGROUNDS, redirectIfSignedIn } from "../LoginShell";

// Students only. Parents: /login/parent, staff: /login/staff.
export default async function StudentLoginPage({
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
    <LoginShell title={t("studentLoginTitle")} background={LOGIN_BACKGROUNDS.student}>
      <LoginForm locale={locale} urlError={error} reason={reason} variant="student" />
    </LoginShell>
  );
}
