"use client";

import { useState, useTransition } from "react";
import { DateInput } from "@/components/ui/date-input";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { EditControls } from "./EditControls";

export interface TermDatesValues {
  term1Start: string;
  term1End: string;
  testDeadline1: string;
  term2Start: string;
  term2End: string;
  testDeadline2: string;
  christmasStart: string;
  christmasEnd: string;
  easterStart: string;
  easterEnd: string;
}

interface Props {
  /** "YYYY-MM-DD" values (config if set, otherwise computed defaults / ""). */
  initial: TermDatesValues;
}

type FieldKey = keyof TermDatesValues;

/** Section/field labels are adminSettings.* message keys. */
const SECTIONS: Array<{
  titleKey: string;
  fields: Array<{ key: FieldKey; labelKey: string }>;
}> = [
  {
    titleKey: "term1",
    fields: [
      { key: "term1Start", labelKey: "starts" },
      { key: "term1End", labelKey: "ends" },
      { key: "testDeadline1", labelKey: "lastDayForTests" },
    ],
  },
  {
    titleKey: "term2",
    fields: [
      { key: "term2Start", labelKey: "starts" },
      { key: "term2End", labelKey: "ends" },
      { key: "testDeadline2", labelKey: "lastDayForTests" },
    ],
  },
  {
    titleKey: "christmasHolidays",
    fields: [
      { key: "christmasStart", labelKey: "firstDay" },
      { key: "christmasEnd", labelKey: "lastDay" },
    ],
  },
  {
    titleKey: "easterHolidays",
    fields: [
      { key: "easterStart", labelKey: "firstDay" },
      { key: "easterEnd", labelKey: "lastDay" },
    ],
  },
];

type Translator = (key: string, values?: Record<string, string | number>) => string;

function validate(v: TermDatesValues, t: Translator): string | null {
  if (!v.term1Start || !v.term1End || !v.term2Start || !v.term2End) {
    return t("errTermDatesRequired");
  }
  if (!(v.term1Start <= v.term1End && v.term1End < v.term2Start && v.term2Start <= v.term2End)) {
    return t("errTermOrder");
  }
  if (v.testDeadline1 && !(v.term1Start <= v.testDeadline1 && v.testDeadline1 <= v.term1End)) {
    return t("errDeadline1");
  }
  if (v.testDeadline2 && !(v.term2Start <= v.testDeadline2 && v.testDeadline2 <= v.term2End)) {
    return t("errDeadline2");
  }
  for (const [s, e, nameKey] of [
    [v.christmasStart, v.christmasEnd, "holidayChristmas"],
    [v.easterStart, v.easterEnd, "holidayEaster"],
  ] as const) {
    if (!!s !== !!e) return t("errHolidayPair", { name: t(nameKey) });
    if (s && e && s > e) return t("errHolidayOrder", { name: t(nameKey) });
  }
  return null;
}

export function TermDatesForm({ initial }: Props) {
  const t = useTranslations("adminSettings");
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const { mutate } = trpc.settings.upsert.useMutation({
    onSuccess: () => {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const error = editing ? validate(values, t as unknown as Translator) : null;

  function save() {
    if (error) return;
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v));
    startTransition(() => {
      mutate({ key: "termDates", value: JSON.stringify(payload) });
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">{t("termDatesIntro")}</p>

      {SECTIONS.map((section) => (
        <div key={section.titleKey}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {t(section.titleKey)}
          </p>
          <div className="flex gap-3 flex-wrap">
            {section.fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-slate-500 mb-1">{t(f.labelKey)}</label>
                <DateInput
                  value={values[f.key]}
                  disabled={!editing}
                  onChange={(iso) => {
                    setValues((v) => ({ ...v, [f.key]: iso }));
                    setSaved(false);
                  }}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <EditControls
        editing={editing}
        pending={pending}
        saved={saved}
        canSave={!error}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValues(initial); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
