"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateMyProfile } from "./actions";
import { DEPARTMENTS } from "@/lib/departments";

export function ProfileForm({
  initial,
  hasStaffProfile,
}: {
  initial: { name: string; phone: string; department: string; pmp: string };
  hasStaffProfile: boolean;
}) {
  const t = useTranslations("profile");
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  // Keep an existing free-text value that isn't in the canonical list selectable.
  const departmentOptions =
    form.department && !DEPARTMENTS.includes(form.department)
      ? [form.department, ...DEPARTMENTS]
      : DEPARTMENTS;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateMyProfile(form);
      if (res.ok) toast.success(t("saved"));
      else toast.error(t(res.error as "errName"));
    });
  }

  const inputClass =
    "w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className={labelClass} htmlFor="pf-name">{t("name")}</label>
        <input id="pf-name" value={form.name} onChange={set("name")} className={inputClass} required />
      </div>

      {hasStaffProfile && (
        <>
          <div>
            <label className={labelClass} htmlFor="pf-pmp">{t("pmp")}</label>
            <input
              id="pf-pmp"
              value={form.pmp}
              onChange={set("pmp")}
              className={inputClass}
              placeholder={t("pmpHint")}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pf-phone">{t("phone")}</label>
            <input id="pf-phone" value={form.phone} onChange={set("phone")} className={inputClass} type="tel" />
          </div>
          <div>
            <label className={labelClass} htmlFor="pf-department">{t("department")}</label>
            <select
              id="pf-department"
              value={form.department}
              onChange={set("department")}
              className={`${inputClass} bg-white`}
            >
              <option value="">—</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {t("save")}
      </button>
    </form>
  );
}
