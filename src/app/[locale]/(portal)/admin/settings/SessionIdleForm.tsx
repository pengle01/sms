"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MIN_IDLE_MINUTES, MAX_IDLE_MINUTES } from "@/lib/sessionPolicy";
import { EditControls } from "./EditControls";
import { saveSessionIdle } from "./actions";

/** Staff idle logout, in minutes (sessionPolicy.ts). */
export function SessionIdleForm({ initial }: { initial: number }) {
  const t = useTranslations("adminSettings");
  const router = useRouter();
  const [value, setValue] = useState(String(initial));
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveSessionIdle(Number(value));
      if (res.ok) {
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">{t("sessionIdleIntro")}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{t("sessionIdleLabel")}</span>
        {editing ? (
          <input
            type="number"
            min={MIN_IDLE_MINUTES}
            max={MAX_IDLE_MINUTES}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 w-24 px-2 rounded-lg border border-slate-200 text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        ) : (
          <span className="text-sm text-slate-600">{t("sessionIdleValue", { minutes: initial })}</span>
        )}
      </div>
      <EditControls
        editing={editing}
        pending={pending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValue(String(initial)); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
