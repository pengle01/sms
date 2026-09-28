import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Wrench, Plus, Search, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getActiveAuth } from "@/server/authz";
import { getRooms } from "@/server/rooms";
import { pickQueryString } from "@/lib/listFilters";
import { fmtDisplayDateTime } from "@/lib/dates";
import {
  EQUIPMENT,
  STATUSES,
  MAINTENANCE_KEYS,
  availableTabs,
  canFileMaintenance,
  filterRequests,
  isEquipment,
  isStatus,
  resolveTab,
  sortRequests,
  unresolvedCount,
  type MaintenanceTab,
} from "@/lib/maintenance";
import { assignedRoomNames, getMaintenanceViewer, listRequests } from "@/server/maintenance";
import { EquipmentIcon, MaintenanceStatusBadge } from "./ui";

export interface MaintenanceListParams {
  tab?: string;
  status?: string;
  equipment?: string;
  q?: string;
}

/**
 * The maintenance list, shared by the teacher, office and admin portals.
 *
 * Tabs: "My requests" for everyone, "My rooms" for IT maintainers (their rooms
 * plus every room nobody maintains), "All" for the admin. Everything shown has
 * already been restricted to what this viewer may see.
 */
export async function MaintenanceList({ basePath, params }: { basePath: string; params: MaintenanceListParams }) {
  const auth = await getActiveAuth();
  if (!auth || !canFileMaintenance(auth.roles)) notFound();

  const t = await getTranslations("maintenance");
  const tEq = (e: string) => t(`equipment.${e}` as Parameters<typeof t>[0]);
  const tSt = (s: string) => t(`status.${s}` as Parameters<typeof t>[0]);

  const [viewer, assigned] = await Promise.all([getMaintenanceViewer(auth), assignedRoomNames()]);
  const tab = resolveTab(params.tab, viewer);
  const tabs = availableTabs(viewer);

  // Every tab's rows, for the counts on the tabs — at most three small queries.
  const byTab = new Map<MaintenanceTab, Awaited<ReturnType<typeof listRequests>>>();
  await Promise.all(tabs.map(async (k) => byTab.set(k, await listRequests(viewer, k, assigned))));
  const all = byTab.get(tab) ?? [];

  const status = isStatus(params.status) ? params.status : undefined;
  const equipment = isEquipment(params.equipment) ? params.equipment : undefined;
  const q = params.q?.trim() ?? "";
  const rows = sortRequests(filterRequests(all, { status, equipment, q }));
  const filtered = rows.length !== all.length;

  const current = { tab, status, equipment, q: q || undefined };
  const hrefWith = (over: Partial<Record<(typeof MAINTENANCE_KEYS)[number], string | undefined>>) =>
    pickQueryString({ ...current, ...over }, MAINTENANCE_KEYS) || "?";
  const rowQuery = pickQueryString(current, MAINTENANCE_KEYS);

  // The admin also sees which rooms have no IT maintainer, so gaps are visible.
  const uncovered = viewer.isAdmin
    ? (await getRooms()).map((r) => r.name).filter((name) => !assigned.has(name))
    : [];

  const pill = (active: boolean) =>
    cn(
      "h-9 px-3 rounded-xl text-sm font-medium transition-colors border inline-flex items-center gap-1.5",
      active
        ? "bg-emerald-600 text-white border-emerald-600"
        : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
    );
  const caption = "text-xs font-semibold text-slate-400 uppercase tracking-wide";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-6 h-6" />
            {t("title")}
          </h2>
          <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
        </div>
        <Link
          href={`${basePath}/new`}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          {t("newRequest")}
        </Link>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-slate-200">
          {tabs.map((k) => {
            const open = unresolvedCount(byTab.get(k) ?? []);
            return (
              <Link
                key={k}
                href={pickQueryString({ tab: k }, MAINTENANCE_KEYS) || "?"}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2",
                  k === tab
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {t(`tab_${k}` as Parameters<typeof t>[0])}
                {open > 0 && (
                  <span className="rounded-full bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5">{open}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {tab === "rooms" && (
        <p className="text-sm text-slate-500">
          {viewer.myRooms.size > 0
            ? t("roomsTabHint", { rooms: [...viewer.myRooms].sort((a, b) => a.localeCompare(b, "el", { numeric: true })).join(", ") })
            : t("roomsTabHintNone")}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <p className={caption}>{t("filterStatus")}</p>
          <div className="flex gap-2 flex-wrap">
            {STATUSES.map((s) => (
              <Link key={s} href={hrefWith({ status: s === status ? undefined : s })} className={pill(status === s)}>
                {tSt(s)}
                <span className="text-xs opacity-70">{all.filter((r) => r.status === s).length}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className={caption}>{t("filterEquipment")}</p>
          <div className="flex gap-2 flex-wrap">
            {EQUIPMENT.filter((e) => all.some((r) => r.equipment === e)).map((e) => (
              <Link key={e} href={hrefWith({ equipment: e === equipment ? undefined : e })} className={pill(equipment === e)}>
                <EquipmentIcon equipment={e} className="w-3.5 h-3.5" />
                {tEq(e)}
              </Link>
            ))}
          </div>
        </div>
        <form method="GET" className="flex items-end gap-2">
          <input type="hidden" name="tab" value={tab} />
          {status && <input type="hidden" name="status" value={status} />}
          {equipment && <input type="hidden" name="equipment" value={equipment} />}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              className="h-9 w-56 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {filtered && (
            <Link href={hrefWith({ status: undefined, equipment: undefined, q: undefined })} className="h-9 px-3 inline-flex items-center text-sm text-slate-500 hover:text-slate-800">
              {t("clearFilters")}
            </Link>
          )}
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-5 py-14 text-center text-slate-400">
              <Wrench className="w-10 h-10 mx-auto mb-2 opacity-30" />
              {all.length === 0 ? t(`empty_${tab}` as Parameters<typeof t>[0]) : t("noMatches")}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`${basePath}/${r.id}${rowQuery}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-600">
                      <EquipmentIcon equipment={r.equipment} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{r.room}</span>
                        <span className="text-sm text-slate-500">· {tEq(r.equipment)}</span>
                        <MaintenanceStatusBadge status={r.status} label={tSt(r.status)} />
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5 line-clamp-1">{r.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {r.createdByName ?? "—"} · {fmtDisplayDateTime(r.createdAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {viewer.isAdmin && uncovered.length > 0 && (
        <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-amber-800 flex items-center gap-1.5">
            <MapPin className="w-4 h-4" />
            {t("uncoveredRooms", { count: uncovered.length })}
          </summary>
          <p className="text-amber-700 mt-2">{t("uncoveredRoomsHint")}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {uncovered.map((name) => (
              <span key={name} className="rounded-md border border-amber-200 bg-white px-1.5 py-0.5 text-xs text-slate-600">
                {name}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
