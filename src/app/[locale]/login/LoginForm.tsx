"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { staffLoginAction, parentLoginAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  MissingEmail: "Please enter your email address.",
  MissingCredentials: "Please enter your email and password.",
  Unauthorized: "User not found or account not active.",
  InvalidCredentials: "Invalid email or password.",
};

interface LoginFormProps {
  locale: string;
  isDev: boolean;
  urlError?: string;
}

export function LoginForm({ locale, isDev, urlError }: LoginFormProps) {
  const t = useTranslations("auth");

  const errorMessage = urlError ? (ERROR_MESSAGES[urlError] ?? `Error: ${urlError}`) : null;
  const otherLocale = locale === "el" ? "en" : "el";
  const otherLocaleLabel = locale === "el" ? "EN" : "ΕΛ";

  return (
    <div className="space-y-5">
      {/* Language switcher */}
      <div className="flex justify-end gap-1">
        <span className="text-xs px-3 py-1.5 rounded-full bg-white/20 text-white font-semibold">
          {locale === "el" ? "ΕΛ" : "EN"}
        </span>
        <a
          href={`/${otherLocale}/login`}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Staff / Students */}
        <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm p-8 space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300 mb-1">
              {isDev ? "Dev mode" : "Microsoft SSO"}
            </p>
            <h2 className="text-xl font-bold text-white">{t("staffLogin")}</h2>
            <p className="text-sm text-lime-300/70 mt-1">
              {isDev ? "Enter any staff email — no password required" : t("staffLoginDesc")}
            </p>
          </div>

          {isDev ? (
            <form action={staffLoginAction} className="space-y-4">
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-1.5">
                <Label htmlFor="staff-email" className="text-lime-200 text-sm">{t("email")}</Label>
                <Input
                  id="staff-email"
                  name="email"
                  type="email"
                  placeholder="teacher@school.cy"
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold"
              >
                Sign in
              </Button>
            </form>
          ) : (
            <a
              href={`/api/auth/signin/azure-ad?callbackUrl=/${locale}/admin`}
              className="flex items-center justify-center w-full h-11 rounded-md bg-[#2F3E9E] hover:bg-[#3b4fc0] text-white font-semibold text-sm transition-colors"
            >
              <MicrosoftIcon className="mr-2 h-5 w-5" />
              {t("signInWithMicrosoft")}
            </a>
          )}
        </div>

        {/* Parents */}
        <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm p-8 space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300 mb-1">
              Email &amp; Password
            </p>
            <h2 className="text-xl font-bold text-white">{t("parentLogin")}</h2>
            <p className="text-sm text-lime-300/70 mt-1">{t("parentLoginDesc")}</p>
          </div>

          <form action={parentLoginAction} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-lime-200 text-sm">{t("email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="parent@example.com"
                required
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
        </div>
      </div>
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
