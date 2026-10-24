import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DoorOpen, MapPin, Search, Users, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type WhereaboutsTab = "students" | "teachers" | "rooms" | "groups";

/**
 * «Πού βρίσκεται;» — the heading and the tabs shared by its pages: students
 * now (the live locator, its own route) and the regular-week lookups of
 * teachers, rooms and groups. The students tab shows only where a locator exists.
 */
export async function WhereaboutsTabs({
  active,
  basePath,
  studentsHref,
}: {
  active: WhereaboutsTab;
  /** The «Πού βρίσκεται;» page of this portal, e.g. /el/teacher/whereabouts. */
  basePath: string;
  studentsHref?: string;
}) {
  const t = await getTranslations("whereabouts");
  const tabs: { key: WhereaboutsTab; href: string; label: string; icon: typeof Search }[] = [
    ...(studentsHref ? [{ key: "students" as const, href: studentsHref, label: t("tabStudents"), icon: UserRound }] : []),
    { key: "teachers", href: `${basePath}?tab=teachers`, label: t("tabTeachers"), icon: Search },
    { key: "rooms", href: `${basePath}?tab=rooms`, label: t("tabRooms"), icon: DoorOpen },
    { key: "groups", href: `${basePath}?tab=groups`, label: t("tabGroups"), icon: Users },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="w-6 h-6" />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, href, label, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className={cn(
              "h-9 px-4 inline-flex items-center gap-2 rounded-xl text-sm font-medium border transition-colors",
              active === key
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
