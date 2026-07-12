"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDisplayDate, displayDateText } from "@/lib/dateInput";

// Date field that always displays DD/MM/YY regardless of browser locale.
// A native <input type="date"> renders in the BROWSER's locale (MM/DD/YYYY on
// an English-US machine), which is why it isn't used directly. The visible
// field is DD/MM/YY text; the calendar button opens the hidden native picker;
// forms receive the ISO value through a hidden input, exactly what a native
// date input would have submitted.
interface Props {
  /** Controlled ISO value "YYYY-MM-DD" ("" for empty). Omit for uncontrolled. */
  value?: string;
  /** Uncontrolled initial ISO value. */
  defaultValue?: string;
  /** Fires with the ISO value on every valid change ("" when cleared). */
  onChange?: (iso: string) => void;
  /**
   * Fires only when a date is picked from the calendar or the field is left
   * (blur) with a changed valid value — for auto-submitting filter forms that
   * must not fire on every keystroke.
   */
  onCommit?: (iso: string) => void;
  /** Form field name — submits the ISO value via a hidden input. */
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** ISO bounds, enforced on both typing and the native picker. */
  min?: string;
  max?: string;
  title?: string;
  /** Applied to the visible input so call sites keep their styling. */
  className?: string;
}

const DEFAULT_CLS =
  "h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500";

export function DateInput({
  value,
  defaultValue,
  onChange,
  onCommit,
  name,
  id,
  required,
  disabled,
  min,
  max,
  title,
  className,
}: Props) {
  const controlled = value !== undefined;
  const [internalIso, setInternalIso] = useState(defaultValue ?? "");
  const iso = controlled ? value : internalIso;
  const [text, setText] = useState(displayDateText(iso));
  const [invalid, setInvalid] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const lastChange = useRef<string>(iso); // skip text resync for our own commits
  const lastCommit = useRef<string>(iso); // onCommit fires only on real changes

  // External value change (controlled reset/cancel) → resync the text.
  useEffect(() => {
    if (!controlled || value === lastChange.current) return;
    lastChange.current = value;
    lastCommit.current = value;
    setText(displayDateText(value));
    setInvalid(false);
    setValidity(false);
    if (hiddenRef.current) hiddenRef.current.value = value;
  }, [controlled, value]);

  function setValidity(bad: boolean) {
    textRef.current?.setCustomValidity(bad ? "ΗΗ/ΜΜ/ΕΕ" : "");
  }

  function outOfRange(v: string) {
    return (!!min && v < min) || (!!max && v > max);
  }

  // Sync the hidden form value BEFORE notifying, so form submits in the
  // onChange/onCommit handler read the fresh value.
  function change(nextIso: string) {
    lastChange.current = nextIso;
    if (hiddenRef.current) hiddenRef.current.value = nextIso;
    if (!controlled) setInternalIso(nextIso);
    onChange?.(nextIso);
  }

  function commit(nextIso: string) {
    if (nextIso === lastCommit.current) return;
    lastCommit.current = nextIso;
    onCommit?.(nextIso);
  }

  function handleText(raw: string) {
    setText(raw);
    if (!raw.trim()) {
      setInvalid(false);
      setValidity(false);
      change("");
      return;
    }
    const parsed = parseDisplayDate(raw);
    const ok = !!parsed && !outOfRange(parsed);
    setInvalid(!ok);
    setValidity(!ok);
    if (ok) change(parsed!);
  }

  function handleBlur() {
    if (!text.trim()) {
      commit("");
      return;
    }
    const parsed = parseDisplayDate(text);
    if (parsed && !outOfRange(parsed)) {
      setText(displayDateText(parsed)); // canonical DD/MM/YY
      commit(parsed);
    }
  }

  function handlePick(nextIso: string) {
    setText(displayDateText(nextIso));
    setInvalid(false);
    setValidity(false);
    change(nextIso);
    commit(nextIso);
  }

  function openPicker() {
    const p = pickerRef.current;
    if (!p) return;
    p.value = iso || "";
    if (typeof p.showPicker === "function") p.showPicker();
    else p.focus();
  }

  const wide = /(?:^|\s)(?:w-full|flex-1)(?:\s|$)/.test(className ?? "");
  return (
    <span
      className={cn(
        "relative",
        wide ? "block" : "inline-block",
        className?.includes("flex-1") && "flex-1",
        className?.includes("w-full") && "w-full"
      )}
    >
      <input
        ref={textRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        placeholder="ΗΗ/ΜΜ/ΕΕ"
        size={10}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        title={title}
        className={cn(
          className ?? DEFAULT_CLS,
          "pr-9",
          wide && "w-full",
          invalid && "border-red-400 focus:ring-red-400"
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        aria-label="Ημερολόγιο"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-40"
      >
        <CalendarDays className="w-4 h-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        min={min}
        max={max}
        onChange={(e) => handlePick(e.target.value)}
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
      />
      {name && <input ref={hiddenRef} type="hidden" name={name} defaultValue={iso} />}
    </span>
  );
}
