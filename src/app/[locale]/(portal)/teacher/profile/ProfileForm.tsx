"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Save, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { updateMyProfile } from "./actions";
import { DEPARTMENTS } from "@/lib/departments";

type Form = {
  firstName: string;
  lastName: string;
  phone: string;
  department: string;
  pmp: string;
};

export function ProfileForm({
  initial,
  hasStaffProfile,
  mustEdit = false,
}: {
  initial: Form;
  hasStaffProfile: boolean;
  /** Open straight into edit mode (e.g. a required ΠΜΠ is still missing). */
  mustEdit?: boolean;
}) {
  const t = useTranslations("profile");
  const [form, setForm] = useState<Form>(initial);
  const [editing, setEditing] = useState(mustEdit);
  const [pending, startTransition] = useTransition();

  const set =
    (key: keyof Form) =>
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
      if (res.ok) {
        toast.success(t("saved"));
        setEditing(false);
      } else {
        toast.error(t(res.error as "errFirstName"));
      }
    });
  }

  function handleCancel() {
    setForm(initial);
    setEditing(false);
  }

  const inputClass =
    "w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

  // ---- Read-only view ----
  if (!editing) {
    return (
      <div className="space-y-4 max-w-lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ReadField label={t("firstName")} value={form.firstName} />
          <ReadField label={t("lastName")} value={form.lastName} />
        </div>

        {hasStaffProfile && (
          <>
            <ReadField label={t("pmp")} value={form.pmp} />
            <ReadField label={t("phone")} value={form.phone} />
            <ReadField label={t("department")} value={form.department} />
          </>
        )}

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
        >
          <Pencil className="w-4 h-4" />
          {t("edit")}
        </button>
      </div>
    );
  }

  // ---- Edit view ----
  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="pf-firstName">{t("firstName")}</label>
          <input id="pf-firstName" value={form.firstName} onChange={set("firstName")} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="pf-lastName">{t("lastName")}</label>
          <input id="pf-lastName" value={form.lastName} onChange={set("lastName")} className={inputClass} required />
        </div>
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
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pf-phone">{t("phone")}</label>
            <input id="pf-phone" value={form.phone} onChange={set("phone")} className={inputClass} type="tel" required />
          </div>
          <div>
            <label className={labelClass} htmlFor="pf-department">{t("department")}</label>
            <select
              id="pf-department"
              value={form.department}
              onChange={set("department")}
              className={`${inputClass} bg-white`}
              required
            >
              <option value="">—</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t("save")}
        </button>
        {!mustEdit && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            <X className="w-4 h-4" />
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="block text-sm font-medium text-slate-700 mb-1.5">{label}</p>
      <p className="h-10 px-3 flex items-center rounded-lg border border-slate-100 bg-slate-50 text-sm text-slate-700">
        {value || "—"}
      </p>
    </div>
  );
}
