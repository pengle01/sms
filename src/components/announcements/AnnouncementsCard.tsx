import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { fmtDisplayDate } from "@/lib/dates";
import { staffAuthorLabel } from "@/lib/staffName";
import { AttachmentList } from "@/components/attachments/AttachmentLink";
import type { ActiveAnnouncement } from "@/server/announcements";

/** Read-only announcements, as they appear on a staff dashboard. */
export async function AnnouncementsCard({ announcements }: { announcements: ActiveAnnouncement[] }) {
  const t = await getTranslations("dashboard");
  if (announcements.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-900">
          <Megaphone className="w-4 h-4" />
          {t("announcements")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {announcements.map((a) => (
          <div key={a.id} className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2">
            {a.title && <p className="text-sm font-semibold text-slate-900">{a.title}</p>}
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.body}</p>
            <AttachmentList files={a.files} className="mt-2" />
            <p className="text-xs text-slate-400 mt-1">
              {staffAuthorLabel(
                { role: a.author.role, name: a.author.name, scheduleName: a.author.staffProfile?.scheduleName },
                t("officeAuthor"),
              )}{" "}
              · {fmtDisplayDate(a.createdAt)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
