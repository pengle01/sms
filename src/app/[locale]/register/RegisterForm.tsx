"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { registerAction } from "./actions";
import { SELF_REGISTER_EDUCATOR_ROLES } from "@/lib/rbac";
import { useTranslations } from "next-intl";

interface RegisterFormProps {
  locale: string;
  error?: string;
  success?: boolean;
  staffNames: string[];
}

// Roles offered at sign-up, with their message key. Educators (the first four)
// claim a timetable name; office & chaperone do not.
const REGISTER_ROLES = [
  "TEACHER",
  "HEADTEACHER_B",
  "HEADTEACHER_A",
  "HEADMASTER",
  "SCHOOL_ADMIN",
  "CHAPERONE",
] as const;
const ROLE_LABEL_KEY = {
  TEACHER: "roleTeacher",
  HEADTEACHER_B: "roleHeadteacherB",
  HEADTEACHER_A: "roleHeadteacherA",
  HEADMASTER: "roleHeadmaster",
  SCHOOL_ADMIN: "roleSchoolAdmin",
  CHAPERONE: "roleChaperone",
} as const;
// Same set the server uses to decide who claims a timetable name — keep in sync
// by importing it rather than re-listing (rbac.ts is client-safe: type-only import).
const CLAIM_ROLES: string[] = SELF_REGISTER_EDUCATOR_ROLES;

export function RegisterForm({ locale, error, success, staffNames }: RegisterFormProps) {
  const t = useTranslations("register");
  const tAuth = useTranslations("auth");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [staffName, setStaffName] = useState("");

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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName" className="text-lime-200 text-sm">{t("firstName")}</Label>
            <Input
              id="firstName" name="firstName" type="text" required autoComplete="given-name"
              className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName" className="text-lime-200 text-sm">{t("lastName")}</Label>
            <Input
              id="lastName" name="lastName" type="text" required autoComplete="family-name"
              className="bg-white/10 border-white/20 text-white placeholder:text-lime-300/40 focus-visible:ring-emerald-400"
            />
          </div>
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
            {REGISTER_ROLES.map((r) => {
              const labelKey = ROLE_LABEL_KEY[r];
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

        {CLAIM_ROLES.includes(selectedRole) && (
          <div className="space-y-1.5">
            <Label htmlFor="staffName" className="text-lime-200 text-sm">{t("staffName")}</Label>
            {staffNames.length === 0 ? (
              <p className="text-sm text-amber-300/80 px-1">{t("staffNameNone")}</p>
            ) : (
              <>
                <input type="hidden" name="staffName" value={staffName} />
                <Select value={staffName} onValueChange={(v) => setStaffName(v ?? "")}>
                  <SelectTrigger className="w-full h-10 bg-white/10 border-white/20 text-white data-placeholder:text-lime-300/40 focus-visible:ring-emerald-400">
                    <SelectValue placeholder={t("staffNamePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {staffNames.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
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
