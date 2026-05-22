"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { registerAction } from "./actions";
import { useTranslations } from "next-intl";

interface RegisterFormProps {
  locale: string;
  error?: string;
  success?: boolean;
  staffNames: string[];
}

export function RegisterForm({ locale, error, success, staffNames }: RegisterFormProps) {
  const t = useTranslations("register");
  const tAuth = useTranslations("auth");
  const [selectedRole, setSelectedRole] = useState<string>("");

  if (success) {
    return (
      <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm p-10 space-y-4 text-center">
        <div className="flex justify-center">
          <CheckCircle2 className="w-12 h-12 text-lime-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{t("successTitle")}</h2>
        <p className="text-sm text-emerald-300/80">{t("successMessage")}</p>
        <Link
          href={`/${locale}/login`}
          className="inline-block mt-4 text-sm font-medium text-lime-400 hover:text-lime-300"
        >
          ← {t("signIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm p-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">{t("title")}</h2>
        <p className="text-sm text-lime-300/70 mt-1">{t("subtitle")}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t(error as Parameters<typeof t>[0])}
        </div>
      )}

      <form action={registerAction} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-lime-200 text-sm">{t("name")}</Label>
          <Input
            id="name" name="name" type="text" required autoComplete="name"
            className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-lime-200 text-sm">{t("email")}</Label>
          <Input
            id="email" name="email" type="email" required autoComplete="email"
            className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-lime-200 text-sm">{t("password")}</Label>
            <Input
              id="password" name="password" type="password" required autoComplete="new-password" minLength={8}
              className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-lime-200 text-sm">{t("confirmPassword")}</Label>
            <Input
              id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password"
              className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-lime-200">{t("role")}</p>
          <div className="grid grid-cols-1 gap-2">
            {(["TEACHER", "SCHOOL_ADMIN", "CHAPERONE"] as const).map((r) => {
              const labelKey = r === "TEACHER" ? "roleTeacher" : r === "SCHOOL_ADMIN" ? "roleSchoolAdmin" : "roleChaperone";
              return (
                <label key={r} className="flex items-center gap-3 rounded-lg border border-white/20 px-4 py-3 cursor-pointer hover:bg-white/10 has-[:checked]:border-lime-400 has-[:checked]:bg-lime-400/10 transition-colors">
                  <input
                    type="radio" name="role" value={r} required
                    className="accent-lime-400"
                    onChange={() => setSelectedRole(r)}
                  />
                  <span className="text-sm text-white">{t(labelKey)}</span>
                </label>
              );
            })}
          </div>
        </div>

        {selectedRole === "TEACHER" && (
          <div className="space-y-1.5">
            <Label htmlFor="staffName" className="text-lime-200 text-sm">{t("staffName")}</Label>
            {staffNames.length === 0 ? (
              <p className="text-sm text-amber-300/80 px-1">{t("staffNameNone")}</p>
            ) : (
              <select
                id="staffName"
                name="staffName"
                required
                className="w-full rounded-md bg-white/10 border border-white/20 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 [&>option]:text-slate-900"
                defaultValue=""
              >
                <option value="" disabled>{t("staffNamePlaceholder")}</option>
                {staffNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <Button type="submit" className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold">
          {t("submit")}
        </Button>
      </form>

      <p className="text-center text-sm text-emerald-300/70">
        {t("alreadyHaveAccount")}{" "}
        <Link href={`/${locale}/login`} className="text-lime-400 hover:text-lime-300 font-medium">
          {tAuth("login")}
        </Link>
      </p>
    </div>
  );
}
