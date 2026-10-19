"use client";

import { useRouter } from "next/navigation";
import { DateInput } from "@/components/ui/date-input";

/** Picks the report's day; navigates on commit. */
export function DateFilter({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  return (
    <DateInput
      id="duty-report-date"
      defaultValue={value}
      max={max}
      onCommit={(iso) => iso && router.push(`?date=${iso}`)}
      className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-sm"
    />
  );
}
