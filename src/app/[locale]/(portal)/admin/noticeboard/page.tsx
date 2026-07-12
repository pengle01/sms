import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, AlertCircle } from "lucide-react";
import { NewNoticeDialog } from "./NewNoticeDialog";
import { AcknowledgeButton } from "./AcknowledgeButton";
import { isStaff } from "@/lib/rbac";
import { fmtDisplayDateTime } from "@/lib/dates";
import { getTranslations } from "next-intl/server";
import type { Role } from "@/generated/prisma/client";

export default async function NoticeboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const role = session.user.role as Role;
  const canPost = isStaff(role);
  const t = await getTranslations("adminNoticeboard");

  const notices = await db.notice.findMany({
    where: canPost ? {} : { staffOnly: false },
    include: {
      tags: true,
      acknowledgments: { where: { userId: session.user.id } },
    },
    orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
          <p className="text-slate-500 text-sm mt-1">{t("noticeCount", { count: notices.length })}</p>
        </div>
        {canPost && <NewNoticeDialog locale={locale} />}
      </div>

      {notices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Bell className="w-12 h-12 mb-3 opacity-30" />
          <p>{t("empty")}</p>
        </div>
      )}

      <div className="space-y-3">
        {notices.map((notice) => {
          const acknowledged = notice.acknowledgments.length > 0;
          return (
            <Card key={notice.id} className={notice.urgent ? "border-red-200" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                    notice.urgent ? "bg-red-50" : "bg-emerald-50"
                  }`}>
                    {notice.urgent
                      ? <AlertCircle className="w-5 h-5 text-red-500" />
                      : <Bell className="w-5 h-5 text-emerald-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900">{notice.title}</h3>
                      {notice.urgent && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs" variant="outline">
                          {t("urgent")}
                        </Badge>
                      )}
                      {notice.staffOnly && (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs" variant="outline">
                          {t("staffOnly")}
                        </Badge>
                      )}
                      {notice.tags.map((tag) => (
                        <Badge key={tag.id} variant="outline" className="text-xs">{tag.tag}</Badge>
                      ))}
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{notice.body}</p>
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                      <p className="text-xs text-slate-400">
                        {fmtDisplayDateTime(notice.createdAt)}
                      </p>
                      <AcknowledgeButton
                        noticeId={notice.id}
                        acknowledged={acknowledged}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
