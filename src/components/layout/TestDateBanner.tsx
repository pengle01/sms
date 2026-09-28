import { getTranslations } from "next-intl/server";
import { testDateOverride, fmtDisplayDate } from "@/lib/dates";

/**
 * Says so, on every page, when the app is running on a faked "today".
 *
 * NEXT_PUBLIC_TEST_DATE is inlined at build time and is not gated on NODE_ENV,
 * so a production build fakes the date exactly like development does. Until this
 * banner existed nothing revealed it — a UAT image shipped to a real school
 * would have looked completely normal while writing attendance on the wrong day.
 *
 * Renders nothing on the real clock, which is the case in production.
 */
export async function TestDateBanner() {
  const override = testDateOverride();
  if (!override) return null;

  const t = await getTranslations("common");
  return (
    <div
      role="status"
      className="bg-amber-500 text-amber-950 px-3 py-1.5 text-center text-sm font-semibold"
    >
      {t("testDateBanner", { date: fmtDisplayDate(override + "T00:00:00.000Z") })}
    </div>
  );
}
