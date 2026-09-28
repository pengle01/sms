import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, CircleDot, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveAuth } from "@/server/authz";
import { fmtDisplayDateTime } from "@/lib/dates";
import {
  allowedTransitions,
  canFileMaintenance,
  isHandler,
  type MaintenanceActor,
  type Status,
} from "@/lib/maintenance";
import { assignedRoomNames, getMaintenanceViewer, loadRequest, personName } from "@/server/maintenance";
import { EquipmentIcon, MaintenanceStatusBadge } from "./ui";
import { RequestActions } from "./RequestActions";

/** One request: its details, its full timeline, and what this person may do next. */
export async function MaintenanceDetail({
  basePath,
  id,
  backQuery = "",
}: {
  basePath: string;
  id: string;
  /** The list's filters, so "back" returns to the same view. */
  backQuery?: string;
}) {
  const auth = await getActiveAuth();
  if (!auth || !canFileMaintenance(auth.roles)) notFound();

  const t = await getTranslations("maintenance");
  const tSt = (s: Status) => t(`status.${s}` as Parameters<typeof t>[0]);

  const [viewer, assigned] = await Promise.all([getMaintenanceViewer(auth), assignedRoomNames()]);
  const request = await loadRequest(id, viewer, assigned);
  if (!request) notFound();

  const actors: MaintenanceActor[] = [];
  if (request.createdById === viewer.userId) actors.push("filer");
  if (isHandler(viewer, request.room, assigned)) actors.push("handler");
  const transitions = allowedTransitions(actors, request.status);
  const filer = personName(request.createdBy);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <Link href={`${basePath}${backQuery}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ChevronLeft className="w-4 h-4" />
          {t("title")}
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <EquipmentIcon equipment={request.equipment} className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {request.room} · {t(`equipment.${request.equipment}` as Parameters<typeof t>[0])}
              </h2>
              <p className="text-sm text-slate-500">
                {t("filedBy", { name: filer ?? "—", date: fmtDisplayDateTime(request.createdAt) })}
              </p>
            </div>
          </div>
          <MaintenanceStatusBadge status={request.status} label={tSt(request.status)} className="text-sm px-3 py-1" />
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t("fieldDescription")}</p>
          <p className="text-slate-800 whitespace-pre-wrap">{request.description}</p>
          {request.resolvedAt && (
            <p className="text-sm text-emerald-700 mt-3">
              {t("resolvedOn", { date: fmtDisplayDateTime(request.resolvedAt) })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("timeline")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3">
            {request.events.map((e) => {
              const who = personName(e.author) ?? "—";
              const when = fmtDisplayDateTime(e.createdAt);
              if (e.kind === "COMMENT") {
                return (
                  <li key={e.id} className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                    <p className="text-xs text-slate-500 mb-1">
                      <span className="font-medium text-slate-700">{who}</span> · {when}
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{e.body}</p>
                  </li>
                );
              }
              return (
                <li key={e.id} className="text-sm">
                  <div className="flex items-center gap-2 flex-wrap text-slate-500">
                    <CircleDot className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="font-medium text-slate-700">{who}</span>
                    {e.kind === "CREATED" ? (
                      <span>{t("eventCreated")}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {e.fromStatus && <MaintenanceStatusBadge status={e.fromStatus} label={tSt(e.fromStatus)} />}
                        <ArrowRight className="w-3 h-3" />
                        {e.toStatus && <MaintenanceStatusBadge status={e.toStatus} label={tSt(e.toStatus)} />}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">· {when}</span>
                  </div>
                  {e.body && (
                    <p className="ml-5 mt-1.5 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2 text-slate-800 whitespace-pre-wrap">
                      {e.body}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="border-t border-slate-100 pt-4">
            <RequestActions requestId={request.id} status={request.status} transitions={transitions} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
