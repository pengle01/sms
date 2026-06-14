import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveAuth } from "@/server/authz";
import { db } from "@/server/db";
import { isManagement } from "@/lib/rbac";
import { getTranslations } from "next-intl/server";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { NotificationsBoard } from "@/components/notifications/NotificationsBoard";
import { ReferralTabs } from "@/components/referrals/ReferralTabs";
import { PenSquare, Megaphone, X } from "lucide-react";
import { postAnnouncement, deleteAnnouncement } from "./announcement-actions";

export default async function TeacherNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  const t = await getTranslations("staffNotify");
  const td = await getTranslations("dashboard");

  const canManage = auth.roles.some((r) => isManagement(r));

  // Active announcements (still pinned) — managed here, shown on dashboards.
  const today = utcMidnight();
  const announcements = canManage
    ? await db.announcement.findMany({
        where: { pinnedUntil: { gte: today } },
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { name: true, staffProfile: { select: { scheduleName: true } } } },
        },
      })
    : [];

  const todayIso = localDateStr();
  const field =
    "w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

  const announcementsTab = (
    <div className="space-y-3">
      <details className="group">
        <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 [&::-webkit-details-marker]:hidden">
          <Megaphone className="w-4 h-4" />
          {td("newAnnouncement")}
        </summary>
        <form
          action={postAnnouncement.bind(null, locale)}
          className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3"
        >
          <input name="title" placeholder={td("announcementTitle")} className={field} />
          <textarea name="body" required rows={2} placeholder={td("announcementPlaceholder")} className={field} />
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="pinnedUntil" className="text-xs text-slate-500">
              {td("showUntil")}
            </label>
            <input
              id="pinnedUntil"
              type="date"
              name="pinnedUntil"
              defaultValue={todayIso}
              min={todayIso}
              className="px-2 py-1 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              className="ml-auto inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
            >
              <Megaphone className="w-3.5 h-3.5" />
              {td("post")}
            </button>
          </div>
        </form>
      </details>

      {announcements.length === 0 ? (
        <p className="text-sm text-slate-400 border-t border-slate-100 pt-3">{td("noAnnouncements")}</p>
      ) : (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                {a.title && <p className="text-sm font-semibold text-slate-900">{a.title}</p>}
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.body}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {a.author?.staffProfile?.scheduleName ?? a.author?.name} · {td("showUntil")}{" "}
                  {fmtDisplayDate(a.pinnedUntil)}
                </p>
              </div>
              <form action={deleteAnnouncement.bind(null, locale)}>
                <input type="hidden" name="id" value={a.id} />
                <button
                  type="submit"
                  aria-label={td("deleteAnnouncement")}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900">Ειδοποιήσεις</h2>
        {/* Management composes ad-hoc messages to teachers */}
        {canManage && (
          <Link
            href={`/${locale}/teacher/noticeboard/compose`}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <PenSquare className="w-4 h-4" />
            {t("newMessage")}
          </Link>
        )}
      </div>

      {canManage ? (
        <ReferralTabs
          variant="underline"
          tabs={[
            { key: "messages", label: t("tabMessages"), content: <NotificationsBoard locale={locale} /> },
            { key: "announcements", label: td("announcements"), content: announcementsTab },
          ]}
        />
      ) : (
        <NotificationsBoard locale={locale} />
      )}
    </div>
  );
}
