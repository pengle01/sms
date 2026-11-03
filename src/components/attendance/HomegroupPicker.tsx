import { getTranslations } from "next-intl/server";

/**
 * «Υπευθυνότητα Τμήματος» / «Εκδρομή»: any teacher may take any homegroup's
 * register in the homegroup period or at P1 of an excursion day (e.g. covering
 * an absent homegroup teacher). A plain
 * GET form to the mark page — no client JS needed.
 */
export async function HomegroupPicker({
  locale,
  period,
  date,
  groups,
  excludeIds = [],
  compact = false,
  kind = "intercalary",
}: {
  locale: string;
  period: number;
  date?: string;
  groups: { id: string; name: string }[];
  excludeIds?: string[];
  compact?: boolean;
  /** Which homeroom register: the homegroup period (purple) or an excursion day's P1 (blue). */
  kind?: "intercalary" | "excursion";
}) {
  const t = await getTranslations("homegroupPeriod");
  const options = groups.filter((g) => !excludeIds.includes(g.id));
  if (options.length === 0) return null;
  const blue = kind === "excursion";
  return (
    <form method="GET" action={`/${locale}/teacher/attendance/mark`} className={`flex items-center gap-1.5 ${compact ? "flex-wrap" : ""}`}>
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name={kind} value="1" />
      {date && <input type="hidden" name="date" value={date} />}
      <select
        name="groupId"
        required
        defaultValue=""
        aria-label={t("pick")}
        className={`rounded-md border bg-white focus:outline-none focus:ring-2 ${blue ? "border-blue-200 text-blue-900 focus:ring-blue-300" : "border-purple-200 text-purple-900 focus:ring-purple-300"} ${compact ? "h-7 text-[11px] px-1 max-w-[7rem]" : "h-8 text-xs px-2"}`}
      >
        <option value="" disabled>
          {t("pick")}
        </option>
        {options.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className={`rounded-md text-white font-medium ${blue ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700"} ${compact ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-xs"}`}
      >
        {t("open")}
      </button>
    </form>
  );
}
