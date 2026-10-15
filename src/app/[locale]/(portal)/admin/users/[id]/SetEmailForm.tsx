"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AtSign, Loader2 } from "lucide-react";
import { setUserEmail } from "./actions";

/** Lets a SUPER_ADMIN change a user's login email (staff or family). */
export function SetEmailForm({ userId, currentEmail }: { userId: string; currentEmail: string }) {
  const t = useTranslations("adminUsers");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(t("emailChangeConfirm", { from: currentEmail, to: email.trim().toLowerCase() }))) return;
    startTransition(async () => {
      const res = await setUserEmail(userId, email);
      if (res.ok) {
        toast.success(t("emailSetSuccess"));
        setEmail("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row sm:items-end gap-3">
      <div className="flex-1">
        <label htmlFor="set-email" className="block text-xs text-slate-500 mb-1.5">{t("newEmail")}</label>
        <input
          id="set-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={currentEmail}
          autoComplete="off"
          className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending || !email.includes("@")}
        className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <AtSign className="w-4 h-4" />}
        {t("setEmail")}
      </button>
    </form>
  );
}
