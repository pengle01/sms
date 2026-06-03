"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { startActivation, verifyActivation } from "./actions";

type Labels = Record<string, string>;

export function ActivateForm({ locale, labels }: { locale: string; labels: Labels }) {
  const t = (k: string) => labels[k] ?? k;

  const [step, setStep] = useState<"details" | "otp" | "done">("details");
  const [role, setRole] = useState<"student" | "guardian" | "">("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [otpId, setOtpId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submitDetails() {
    setError("");
    if (!role) return setError(t("errRoleInvalid"));
    startTransition(async () => {
      const res = await startActivation({ code, role, name, email, password, confirm });
      if (res.ok) {
        setOtpId(res.otpId);
        setStep("otp");
      } else {
        setError(t(res.error));
      }
    });
  }

  function submitOtp() {
    setError("");
    startTransition(async () => {
      const res = await verifyActivation({ otpId, code: otp });
      if (res.ok) setStep("done");
      else setError(t(res.error));
    });
  }

  const inputClass =
    "w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  if (step === "done") {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-8">
        <CheckCircle2 className="w-12 h-12 text-emerald-600" />
        <p className="text-lg font-semibold text-slate-900">{t("done")}</p>
        <p className="text-sm text-slate-500">{t("doneHint")}</p>
        <Link
          href={`/${locale}/login`}
          className="mt-2 inline-flex items-center h-11 px-6 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          {t("goToLogin")}
        </Link>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t("otpSent")}</p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t("otpLabel")}</label>
          <input
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className={cn(inputClass, "text-center tracking-[0.4em] font-mono text-lg")}
            placeholder="______"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={submitOtp}
          disabled={pending || otp.trim().length < 4}
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("verify")}
        </button>
        <button
          onClick={() => { setStep("details"); setError(""); setOtp(""); }}
          className="w-full text-sm text-slate-400 hover:text-slate-600"
        >
          {t("back")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t("codeLabel")}</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("codePlaceholder")}
          className={cn(inputClass, "font-mono tracking-widest uppercase")}
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("chooseRole")}</label>
        <div className="grid grid-cols-2 gap-2">
          {(["student", "guardian"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                "h-11 rounded-xl border text-sm font-medium transition-colors",
                role === r
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              )}
            >
              {r === "student" ? t("roleStudent") : t("roleGuardian")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t("name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{t("email")}</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t("password")}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t("confirmPassword")}</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={submitDetails}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("sendCode")}
      </button>
    </div>
  );
}
