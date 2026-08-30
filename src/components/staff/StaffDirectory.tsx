import { db } from "@/server/db";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Contact, Phone, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { SuggestInput } from "@/components/SuggestInput";
import { suggestionList } from "@/lib/textSearch";
import { pickQueryString } from "@/lib/listFilters";
import {
  type StaffRow,
  STAFF_DIRECTORY_KEYS,
  filterStaff,
  sortStaff,
  staffSpecialties,
  staffSpecialty,
  staffRowLabel,
  hasPhone,
} from "@/lib/staffFilter";

export interface StaffDirectoryParams {
  sp?: string;
  phone?: string;
  q?: string;
}

/**
 * The staff phone list — read-only, shared by management and the office.
 *
 * Deliberately narrow. It selects a phone list's worth of data and no more: no
 * ΠΜΠ, no designations, no link state, no lesson counts. Those belong to the
 * admin roster at /admin/users, which has a different audience and a different
 * job. The only write path for StaffProfile.phone stays updateMyProfile — the
 * directory adds a reader, never a second writer.
 */
export async function StaffDirectory({ params }: { params: StaffDirectoryParams }) {
  const t = await getTranslations("staffDirectory");

  const sp = params.sp?.trim() || undefined;
  const phone = params.phone === "present" || params.phone === "missing" ? params.phone : undefined;
  const q = params.q?.trim() ?? "";
  const current = { sp, phone, q };

  const profiles = await db.staffProfile.findMany({
    select: {
      id: true,
      scheduleName: true,
      phone: true,
      user: { select: { name: true, nameEl: true, email: true } },
      homeroomGroups: { select: { name: true } },
      homeroomHeadGroups: { select: { name: true } },
    },
  });

  // The filter helpers work over StaffRow; the fields this page does not show
  // are filled with neutral values rather than queried.
  const everyone: StaffRow[] = sortStaff(
    profiles.map((p) => ({
      userId: null,
      staffProfileId: p.id,
      scheduleName: p.scheduleName,
      name: p.user?.name ?? null,
      nameEl: p.user?.nameEl ?? null,
      email: p.user?.email ?? null,
      phone: p.phone,
      role: null,
      isActive: true,
      extraAdmin: false,
      specialEducation: false,
      ddkCoordinator: false,
      substitutionCoordinator: false,
      homerooms: [
        ...p.homeroomGroups.map((g) => g.name),
        ...p.homeroomHeadGroups.map((g) => `${g.name} (B')`),
      ],
      lessons: 0,
    })),
  );

  const rows = filterStaff(everyone, { specialty: sp, phone, q });
  const filtered = rows.length !== everyone.length;

  // Counts come from the UNFILTERED roster, so a pill never disappears because
  // of what is already selected.
  const specialties = staffSpecialties(everyone);
  const withPhone = everyone.filter(hasPhone).length;
  const withoutPhone = everyone.length - withPhone;

  const hrefWith = (
    over: Partial<Record<(typeof STAFF_DIRECTORY_KEYS)[number], string | undefined>>,
  ) => pickQueryString({ ...current, ...over }, STAFF_DIRECTORY_KEYS) || "?";

  const suggestions = suggestionList([
    ...everyone.map((r) => r.scheduleName),
    ...everyone.map((r) => r.name),
  ]);

  const pill = (active: boolean, tone: "slate" | "emerald") =>
    cn(
      "h-9 px-3 rounded-xl text-sm font-medium transition-colors border",
      active
        ? tone === "slate"
          ? "bg-slate-800 text-white border-slate-800"
          : "bg-emerald-600 text-white border-emerald-600"
        : tone === "slate"
          ? "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
          : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
    );

  const caption = "text-xs font-semibold text-slate-400 uppercase tracking-wide";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Contact className="w-6 h-6" />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {filtered
            ? t("showingCount", { shown: rows.length, total: everyone.length })
            : t("summary", { total: everyone.length, withPhone })}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {specialties.length > 0 && (
          <div className="space-y-1.5">
            <p className={caption}>{t("filterSpecialty")}</p>
            <div className="flex gap-2 flex-wrap">
              {specialties.map((s) => (
                <Link
                  key={s.code}
                  href={hrefWith({ sp: s.code === sp ? undefined : s.code })}
                  className={cn(pill(sp === s.code, "slate"), "font-semibold")}
                >
                  {s.code}
                  <span className="ml-1.5 text-xs font-normal opacity-70">{s.count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <p className={caption}>{t("filterPhone")}</p>
          <div className="flex gap-2 flex-wrap">
            <Link
              href={hrefWith({ phone: phone === "present" ? undefined : "present" })}
              className={pill(phone === "present", "emerald")}
            >
              {t("phonePresent")}
              <span className="ml-1.5 text-xs opacity-70">{withPhone}</span>
            </Link>
            <Link
              href={hrefWith({ phone: phone === "missing" ? undefined : "missing" })}
              className={pill(phone === "missing", "emerald")}
            >
              {t("phoneMissing")}
              <span className="ml-1.5 text-xs opacity-70">{withoutPhone}</span>
            </Link>
          </div>
        </div>

        <form method="GET" className="flex items-end gap-2">
          {sp && <input type="hidden" name="sp" value={sp} />}
          {phone && <input type="hidden" name="phone" value={phone} />}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <SuggestInput
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              suggestions={suggestions}
              className="h-9 w-64 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {filtered && (
            <Link href="?" className="h-9 px-3 inline-flex items-center text-sm text-slate-500 hover:text-slate-800">
              {t("clearFilters")}
            </Link>
          )}
        </form>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colName")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colSpecialty")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colHomegroup")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colPhone")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colEmail")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-slate-400">
                    <Contact className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {everyone.length === 0 ? t("empty") : t("noMatches")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.staffProfileId} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <span className="font-medium text-slate-900">{staffRowLabel(r) || "—"}</span>
                      {r.scheduleName && r.name && r.scheduleName !== r.name && (
                        <span className="block text-xs text-slate-400">{r.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {staffSpecialty(r) ? (
                        <Badge variant="outline" className="text-xs font-semibold">{staffSpecialty(r)}</Badge>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.homerooms.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.homerooms.map((n) => (
                            <Badge key={n} variant="outline" className="text-xs text-slate-600">{n}</Badge>
                          ))}
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {hasPhone(r) ? (
                        // Same tel: chip the duty desk uses for guardian numbers,
                        // so a tap dials on a phone.
                        <a
                          href={`tel:${r.phone!.trim()}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 whitespace-nowrap"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {r.phone!.trim()}
                        </a>
                      ) : (
                        <span className="text-slate-300 text-xs">{t("noPhoneYet")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs break-all">
                      {r.email ?? <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
