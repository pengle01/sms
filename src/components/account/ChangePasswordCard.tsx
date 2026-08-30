"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { PASSWORD_MIN_LENGTH, validatePasswordChange } from "@/lib/password";
import { changeOwnPassword } from "./password-actions";

/**
 * Change your own password. Same card in every portal — staff, parents,
 * students and chaperones all sign in with a password, so they all get this.
 *
 * The client-side check is a courtesy that keeps the button honest; the action
 * re-validates everything and is the only thing that decides.
 */
export function ChangePasswordCard() {
  const t = useTranslations("account");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();

  const problem = validatePasswordChange({ current, next, confirm });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await changeOwnPassword(current, next, confirm);
      if (res.ok) {
        toast.success(t("passwordChanged"));
        setCurrent("");
        setNext("");
        setConfirm("");
        setShow(false);
      } else {
        toast.error(t(res.error));
      }
    });
  };

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string,
  ) => (
    <div>
      <label htmlFor={id} className="block text-xs text-slate-500 mb-1.5">{label}</label>
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </div>
  );

  return (
    <Card className="max-w-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          {t("changePassword")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {field("pw-current", t("currentPassword"), current, setCurrent, "current-password")}
          {field("pw-next", t("newPassword"), next, setNext, "new-password")}
          {field("pw-confirm", t("confirmPassword"), confirm, setConfirm, "new-password")}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
            >
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {show ? t("hide") : t("show")}
            </button>
            <p className="text-xs text-slate-400">{t("minChars", { n: PASSWORD_MIN_LENGTH })}</p>
          </div>

          <button
            type="submit"
            disabled={pending || problem !== null}
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {t("changePassword")}
          </button>

          {/* Say why the button is dead, but only once they have started typing
              — an untouched form should not open with an error on it. */}
          {problem && (next || confirm) && problem !== "errCurrentRequired" && (
            <p className="text-xs text-amber-600">{t(problem)}</p>
          )}
        </form>

        <p className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
          {t("otherDevicesNote")}
        </p>
      </CardContent>
    </Card>
  );
}
