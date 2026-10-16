"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AtSign, Loader2 } from "lucide-react";
import { validateEmailChange } from "@/lib/emailChange";
import { changeOwnEmail } from "./password-actions";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * Change your own login email — staff only (the page decides whether to show
 * it). Needs the current password; the action re-checks everything.
 */
export function ChangeEmailCard({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations("account");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const problem = email ? validateEmailChange({ current: currentEmail, next: email }) : "errInvalid";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await changeOwnEmail(email, password);
      if (res.ok) {
        toast.success(t("emailChanged", { email: res.email }));
        setEmail("");
        setPassword("");
        router.refresh();
      } else {
        toast.error(t(res.error));
      }
    });
  };

  return (
    <Card className="max-w-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AtSign className="w-4 h-4 text-slate-500" />
          {t("changeEmail")}
        </CardTitle>
        <p className="text-xs text-slate-500">{t("changeEmailHint", { email: currentEmail })}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="new-email" className="block text-xs text-slate-500 mb-1.5">{t("newEmail")}</label>
            <input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {email && problem === "errSame" && <p className="text-xs text-amber-600 mt-1">{t("errSame")}</p>}
          </div>
          <div>
            <label htmlFor="email-pw" className="block text-xs text-slate-500 mb-1.5">{t("currentPassword")}</label>
            <PasswordInput
              id="email-pw"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={pending || !!problem || !password}
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <AtSign className="w-4 h-4" />}
            {t("changeEmailButton")}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
