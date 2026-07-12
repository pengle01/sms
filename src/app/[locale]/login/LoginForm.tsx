// Server component on purpose: the login forms are wired to server actions, which
// Next.js progressively enhances (they POST natively without JS). Keeping this off
// the client means login works with zero hydration — a tap on "Sign in" submits
// even before/without the client island booting on a slow phone.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { familyLoginAction, staffLoginAction } from "./actions";

interface LoginFormProps {
  locale: string;
  urlError?: string;
  variant: "family" | "staff";
}

export async function LoginForm({ locale, urlError, variant }: LoginFormProps) {
  const t = await getTranslations("auth");
  const tActivate = await getTranslations("activate");

  const errorMessages: Record<string, string> = {
    MissingCredentials: t("missingCredentials"),
    InvalidCredentials: t("invalidCredentials"),
  };
  const errorMessage = urlError ? (errorMessages[urlError] ?? `Error: ${urlError}`) : null;
  const otherLocale = locale === "el" ? "en" : "el";
  const otherLocaleLabel = locale === "el" ? "EN" : "ΕΛ";
  const path = variant === "staff" ? "/login/staff" : "/login";
  const isStaff = variant === "staff";

  return (
    <div className="space-y-5">
      {/* Language switcher */}
      <div className="flex justify-end gap-1">
        <span className="text-xs px-3 py-1.5 rounded-full bg-white/20 text-white font-semibold">
          {locale === "el" ? "ΕΛ" : "EN"}
        </span>
        <a
          href={`/${otherLocale}${path}`}
          className="text-xs px-3 py-1.5 rounded-full text-emerald-300/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          {otherLocaleLabel}
        </a>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm p-8 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300 mb-1">
            {t("emailPassword")}
          </p>
          <h2 className="text-xl font-bold text-white">
            {isStaff ? t("staffLogin") : t("familyLogin")}
          </h2>
          <p className="text-sm text-lime-300/70 mt-1">{t("parentLoginDesc")}</p>
        </div>

        <form action={isStaff ? staffLoginAction : familyLoginAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-lime-200 text-sm">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={isStaff ? "teacher@school.cy" : "name@example.com"}
              required
              autoComplete="email"
              className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-lime-200 text-sm">{t("password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold"
          >
            {t("login")}
          </Button>
        </form>

        {isStaff && (
          <>
            {/* Microsoft SSO — alternative sign-in (used in production once Azure is configured) */}
            <div className="flex items-center gap-3 text-lime-300/40 text-xs">
              <span className="h-px flex-1 bg-white/15" /> {locale === "el" ? "ή" : "or"} <span className="h-px flex-1 bg-white/15" />
            </div>
            <a
              href={`/api/auth/signin/azure-ad?callbackUrl=/${locale}/admin`}
              className="flex items-center justify-center w-full h-11 rounded-md bg-[#2F3E9E] hover:bg-[#3b4fc0] text-white font-semibold text-sm transition-colors"
            >
              <MicrosoftIcon className="mr-2 h-5 w-5" />
              {t("signInWithMicrosoft")}
            </a>
          </>
        )}
      </div>

      {isStaff ? (
        <>
          <p className="text-center text-sm text-emerald-300/60 mt-2">
            {t("newStaffPrompt")}{" "}
            <Link href={`/${locale}/register`} className="text-lime-400 hover:text-lime-300 font-medium">
              {t("createAccount")}
            </Link>
          </p>
          <p className="text-center text-sm text-emerald-300/60 mt-1">
            <Link href={`/${locale}/login`} className="text-lime-400 hover:text-lime-300 font-medium">
              {t("toFamilyLogin")}
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-center text-sm text-emerald-300/60 mt-2">
            <Link href={`/${locale}/activate`} className="text-lime-400 hover:text-lime-300 font-medium">
              {tActivate("haveCode")}
            </Link>
          </p>
          <p className="text-center text-sm text-emerald-300/60 mt-1">
            <Link href={`/${locale}/login/staff`} className="text-lime-400 hover:text-lime-300 font-medium">
              {t("toStaffLogin")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    </svg>
  );
}
