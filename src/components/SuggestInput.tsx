"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { matchesSearch } from "@/lib/textSearch";
import { cn } from "@/lib/utils";

/**
 * Live search input with custom autocomplete. Results update while typing
 * (debounced URL update — the server component re-renders, no submit button),
 * and suggestions appear after `minChars` typed characters. The dropdown is
 * rendered by us (not a native <datalist>) so it survives those re-renders and
 * matches accent-insensitively. Render inside a `relative` wrapper.
 * The `name` prop doubles as the query-string parameter.
 */
export function SuggestInput({
  suggestions,
  minChars = 3,
  debounceMs = 300,
  maxSuggestions = 8,
  name,
  defaultValue,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  suggestions: string[];
  minChars?: number;
  debounceMs?: number;
  maxSuggestions?: number;
  name: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [text, setText] = useState(typeof defaultValue === "string" ? defaultValue : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const matches =
    text.trim().length >= minChars
      ? suggestions.filter((s) => matchesSearch(s, text)).slice(0, maxSuggestions)
      : [];
  const showList = open && matches.length > 0;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function navigate(value: string) {
    const sp = new URLSearchParams(searchParams);
    if (value.trim()) sp.set(name, value.trim());
    else sp.delete(name);
    sp.delete("page"); // a new query restarts pagination
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  function choose(value: string) {
    if (timer.current) clearTimeout(timer.current);
    setText(value);
    setOpen(false);
    setActive(-1);
    navigate(value);
  }

  return (
    <>
      <input
        {...props}
        name={name}
        value={text}
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        autoComplete="off"
        className={className}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          setOpen(true);
          setActive(-1);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => navigate(value), debounceMs);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? matches.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            choose(matches[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {showList && (
        <ul
          role="listbox"
          // Keep input focus while clicking a suggestion (prevents blur-close)
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto py-1 text-sm"
        >
          {matches.map((s, i) => (
            <li key={s} role="option" aria-selected={i === active}>
              <button
                type="button"
                onClick={() => choose(s)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-slate-700",
                  i === active && "bg-emerald-50 text-emerald-800"
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
