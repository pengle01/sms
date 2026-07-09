"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { setUserPassword } from "./actions";

/** Lets a SUPER_ADMIN set/reset a user's email+password sign-in credential. */
export function SetPasswordForm({ userId }: { userId: string }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await setUserPassword(userId, password);
      if (res.ok) {
        toast.success("Ο κωδικός ορίστηκε — ο χρήστης μπορεί πλέον να συνδέεται με email και κωδικό πρόσβασης.");
        setPassword("");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row sm:items-end gap-3">
      <div className="flex-1">
        <label htmlFor="set-pw" className="block text-xs text-slate-500 mb-1.5">Νέος κωδικός πρόσβασης</label>
        <div className="relative">
          <input
            id="set-pw"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Τουλάχιστον 8 χαρακτήρες"
            autoComplete="new-password"
            className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={show ? "Απόκρυψη" : "Εμφάνιση"}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <button
        type="submit"
        disabled={pending || password.length < 8}
        className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        Ορισμός κωδικού
      </button>
    </form>
  );
}
