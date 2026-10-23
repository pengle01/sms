"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Plus, X, BookOpen } from "lucide-react";

export interface ClaimOption {
  slotId: string;
  groupId: string;
  groupName: string;
  courseName: string;
  teacherName: string;
  room: string | null;
  /** My subjects with this group — non-empty when it is one of my own groups. */
  myCourses: { id: string; name: string }[];
}

/**
 * «Αναπλήρωση δεύτερου τμήματος»: opens in place, without a round trip, and opens
 * the chosen sheet without scrolling the page back to the top — the teacher is
 * usually halfway down their own register. On one of my own groups it also
 * offers «Δικό μου μάθημα»: my subject with that group instead of a cover.
 */
export function ClaimPicker({
  options,
  base,
  period,
  initialOpen,
}: {
  options: ClaimOption[];
  /** The register's own query: groupId, period, date. */
  base: Record<string, string>;
  period: number;
  initialOpen: boolean;
}) {
  const t = useTranslations("attendance");
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go(groupId: string, courseId?: string) {
    setBusy(courseId ? `${groupId}:${courseId}` : groupId);
    const q = new URLSearchParams({ ...base, claimGroupId: groupId, ...(courseId ? { courseId } : {}) });
    startTransition(() => router.push(`?${q.toString()}`, { scroll: false }));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-700 transition-colors print:hidden"
      >
        <Plus className="w-4 h-4" />
        {t("claimAddSecond")}
      </button>
    );
  }

  const spinner = <Loader2 className="w-3.5 h-3.5 animate-spin" />;
  const btn = "inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium disabled:opacity-50";

  return (
    <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden max-w-2xl print:hidden">
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">{t("claimPickerTitle", { period })}</p>
          <p className="text-xs text-amber-700 mt-0.5">{t("claimPickerHint")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setChoosingFor(null); }}
          aria-label={t("claimClose")}
          className="text-amber-700 hover:text-amber-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {options.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400">{t("claimNone")}</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {options.map((o) => {
            const mine = o.myCourses.length > 0;
            const details = (
              <span className="flex items-center gap-3 text-xs text-slate-500">
                <span>{o.courseName}</span>
                <span className="text-slate-400">{o.teacherName}</span>
                {o.room && <span className="font-mono text-slate-400">{o.room}</span>}
              </span>
            );
            if (!mine) {
              return (
                <button
                  key={o.slotId}
                  type="button"
                  disabled={pending}
                  onClick={() => go(o.groupId)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-sm text-left hover:bg-amber-50/40 transition-colors disabled:opacity-60"
                >
                  <span className="font-medium text-slate-900 inline-flex items-center gap-2">
                    {o.groupName}
                    {busy === o.groupId && spinner}
                  </span>
                  {details}
                </button>
              );
            }
            return (
              <div key={o.slotId} className="px-5 py-2.5 text-sm space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-medium text-slate-900 inline-flex items-center gap-2">
                    {o.groupName}
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {t("claimMyGroup")}
                    </span>
                  </span>
                  {details}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => go(o.groupId)}
                    className={`${btn} border border-amber-300 text-amber-800 hover:bg-amber-50`}
                  >
                    {busy === o.groupId ? spinner : null}
                    {t("claimCover")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setChoosingFor(choosingFor === o.groupId ? null : o.groupId)}
                    aria-expanded={choosingFor === o.groupId}
                    className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {t("claimOwnLesson")}
                  </button>
                </div>
                {choosingFor === o.groupId && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 space-y-1.5">
                    <p className="text-xs font-semibold text-emerald-900">{t("claimPickCourse")}</p>
                    <div className="flex flex-wrap gap-2">
                      {o.myCourses.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={pending}
                          onClick={() => go(o.groupId, c.id)}
                          className={`${btn} border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50`}
                        >
                          {busy === `${o.groupId}:${c.id}` && spinner}
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Brings the second sheet into view once it has loaded (the page stays put otherwise). */
export function ScrollIntoViewOnMount({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return <div ref={ref} className="scroll-mt-4">{children}</div>;
}

/**
 * On an open «Δικό μου μάθημα» sheet: switch to another of my subjects with
 * this group (shown only when there is more than one).
 */
export function LessonSwitcher({
  courses,
  current,
  base,
}: {
  courses: { id: string; name: string }[];
  current: string;
  /** The page's query without courseId. */
  base: Record<string, string>;
}) {
  const t = useTranslations("attendance");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (courses.length < 2) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap print:hidden">
      <span className="text-xs text-emerald-800">{t("claimChangeCourse")}</span>
      {courses.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={pending || c.id === current}
          onClick={() => {
            setBusy(c.id);
            const q = new URLSearchParams({ ...base, courseId: c.id });
            startTransition(() => router.replace(`?${q.toString()}`, { scroll: false }));
          }}
          className={
            c.id === current
              ? "inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white"
              : "inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          }
        >
          {busy === c.id && pending && <Loader2 className="w-3 h-3 animate-spin" />}
          {c.name}
        </button>
      ))}
    </div>
  );
}
