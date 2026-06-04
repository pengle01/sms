import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { getPortalForRole } from "@/lib/rbac";
import { getTranslations } from "next-intl/server";
import type { Role } from "@/generated/prisma";
import { ActivateForm } from "./ActivateForm";

const LABEL_KEYS = [
  "title", "subtitle", "codeLabel", "codePlaceholder", "continue", "chooseRole",
  "roleStudent", "roleGuardian", "name", "email", "password", "confirmPassword",
  "sendCode", "otpSent", "otpLabel", "verify", "back", "done", "doneHint", "goToLogin",
  "errGeneric", "errCodeInvalid", "errRoleInvalid", "errEmailRequired", "errPasswordWeak",
  "errPasswordMismatch", "errEmailTaken", "errStudentClaimed", "errOtpInvalid", "errOtpExpired",
  "errEmailSend", "errGuardianCap",
  "roleTakenStudent", "roleTakenGuardian", "changeCode",
] as const;

export default async function ActivatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect(`/${locale}/${getPortalForRole(session.user.role as Role)}`);
  }

  const t = await getTranslations("activate");
  const labels: Record<string, string> = {};
  for (const k of LABEL_KEYS) labels[k] = t(k);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #064e3b 100%)" }}
    >
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500 mt-1 mb-6">{t("subtitle")}</p>
          <ActivateForm locale={locale} labels={labels} />
        </div>
      </div>
    </div>
  );
}
