import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY } from "@/lib/schoolConfig";
import { maxPeriodCount } from "@/lib/periods";
import { ClipboardEdit, MessageSquare, ArrowRight } from "lucide-react";
import { RequestForm } from "./RequestForm";
import { CancelRequestButton } from "./CancelRequestButton";

export default async function SubstitutionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  if (!isEducator(auth.role)) redirect(`/${locale}/teacher/dashboard`);

  const t = await getTranslations("substitutions");

  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, substitutionCoordinator: true, phone: true },
  });
  if (!staff) redirect(`/${locale}/teacher/dashboard`);

  const [requests, groups, periodsConfig] = await Promise.all([
    db.substitutionRequest.findMany({
      where: { staffId: staff.id },
      include: { group: { select: { name: true } } },
      orderBy: { startDate: "desc" },
      take: 30,
    }),
    db.group.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getPeriodsPerDay(),
  ]);

  const today = utcMidnight();
  const maxPeriod = maxPeriodCount({ ...DEFAULT_PERIODS_PER_DAY, ...periodsConfig });

  const TYPE_LABEL: Record<string, string> = {
    ABSENCE: t("typeAbsence"),
    EXEMPTION: t("typeExemption"),
    ROOM_CHANGE: t("typeRoomChange"),
  };
  const TYPE_COLOR: Record<string, string> = {
    ABSENCE: "bg-red-50 text-red-700 border-red-200",
    EXEMPTION: "bg-amber-50 text-amber-700 border-amber-200",
    ROOM_CHANGE: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
          <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
        </div>
        {staff.substitutionCoordinator && (
          <Link
            href={`/${locale}/teacher/substitutions/plan`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
          >
            {t("coordinatorDesk")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2 items-start">
        {/* New request */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardEdit className="w-4 h-4 text-emerald-600" />
              {t("newRequest")}
            </CardTitle>
            {!staff.phone && (
              <p className="text-xs text-amber-600">{t("noPhone")}</p>
            )}
          </CardHeader>
          <CardContent>
            <RequestForm groups={groups} maxPeriod={maxPeriod} />
          </CardContent>
        </Card>

        {/* My requests */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("myRequests")}</CardTitle>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <p className="text-sm text-slate-400">{t("noRequests")}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const isPast = (r.endDate ?? r.startDate) < today;
                  return (
                    <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-xs ${TYPE_COLOR[r.type]}`}>
                            {TYPE_LABEL[r.type]}
                          </Badge>
                          {fmtDisplayDate(r.startDate)}
                          {r.endDate && ` – ${fmtDisplayDate(r.endDate)}`}
                          {r.periods.length > 0 && (
                            <span className="text-xs text-slate-500">
                              {t("periodsShort")} {r.periods.join(", ")}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {r.reason}
                          {r.reasonDetails && ` — ${r.reasonDetails}`}
                          {r.type === "ROOM_CHANGE" && r.group?.name && ` · ${r.group.name} → ${r.newRoom}`}
                          {r.smsSent && (
                            <span className="ml-2 inline-flex items-center gap-0.5 text-emerald-600">
                              <MessageSquare className="w-3 h-3" /> SMS
                            </span>
                          )}
                        </p>
                      </div>
                      {!isPast && <CancelRequestButton requestId={r.id} />}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
