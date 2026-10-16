"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { KeyRound, Loader2 } from "lucide-react";
import { setUserPassword } from "./actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { PasswordInput } from "@/components/ui/password-input";

/** Lets a SUPER_ADMIN set/reset a user's email+password sign-in credential. */
export function SetPasswordForm({ userId }: { userId: string }) {
  const t = useTranslations("adminUsers");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await setUserPassword(userId, password);
      if (res.ok) {
        toast.success(t("passwordSetSuccess"));
        setPassword("");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row sm:items-end gap-3">
      <div className="flex-1">
        <label htmlFor="set-pw" className="block text-xs text-slate-500 mb-1.5">{t("newPassword")}</label>
        <PasswordInput
          id="set-pw"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("passwordPlaceholder")}
          autoComplete="new-password"
          className="w-full h-10 pl-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending || password.length < PASSWORD_MIN_LENGTH}
        className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {t("setPassword")}
      </button>
    </form>
  );
}
