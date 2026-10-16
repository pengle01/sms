"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { confirmState } from "@/lib/passwordMatch";

type Tone = "light" | "dark";

/**
 * A password field with an eye button to show what was typed, and a Caps Lock
 * warning while it is focused. Takes every <input> prop, so it drops into
 * controlled forms and FormData/server-action forms alike.
 */
export function PasswordInput({
  tone = "light",
  className,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { tone?: Tone }) {
  const t = useTranslations("common.password");
  const [show, setShow] = React.useState(false);
  const [caps, setCaps] = React.useState(false);
  const readCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));

  return (
    <div>
      <div className="relative">
        <Input
          {...props}
          type={show ? "text" : "password"}
          onKeyDown={(e) => { readCaps(e); onKeyDown?.(e); }}
          onKeyUp={(e) => { readCaps(e); onKeyUp?.(e); }}
          onBlur={(e) => { setCaps(false); onBlur?.(e); }}
          className={cn(className, "pr-10")}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t("hide") : t("show")}
          aria-pressed={show}
          title={show ? t("hide") : t("show")}
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2",
            tone === "dark"
              ? "text-lime-200/70 hover:text-white focus-visible:ring-emerald-400"
              : "text-slate-400 hover:text-slate-700 focus-visible:ring-emerald-500",
          )}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {caps && (
        <p className={cn("mt-1 text-xs", tone === "dark" ? "text-amber-300" : "text-amber-600")}>{t("capsLock")}</p>
      )}
    </div>
  );
}

/** «Οι κωδικοί ταιριάζουν» / «δεν ταιριάζουν», once the confirm field has text. */
export function ConfirmHint({ password, confirm, tone = "light" }: { password: string; confirm: string; tone?: Tone }) {
  const t = useTranslations("common.password");
  const state = confirmState(password, confirm);
  if (state === "empty") return null;
  const ok = state === "match";
  return (
    <p
      aria-live="polite"
      className={cn(
        "mt-1 flex items-center gap-1 text-xs",
        ok
          ? tone === "dark" ? "text-lime-300" : "text-emerald-600"
          : tone === "dark" ? "text-amber-300" : "text-amber-600",
      )}
    >
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
      {t(ok ? "match" : "mismatch")}
    </p>
  );
}
