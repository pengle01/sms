import { redirect } from "next/navigation";
import { DateInput } from "@/components/ui/date-input";
import Link from "next/link";
import { getActiveAuth } from "@/server/authz";
import { db } from "@/server/db";
import { isManagement } from "@/lib/rbac";
import { getTranslations } from "next-intl/server";
import { utcMidnight, localDateStr, fmtDisplayDate, fmtDisplayDateTime } from "@/lib/dates";
import { NotificationsBoard } from "@/components/notifications/NotificationsBoard";
import { ReferralTabs } from "@/components/referrals/ReferralTabs";
import { groupSentNotifications } from "@/lib/staffNotifications";
import { PenSquare, Megaphone, X, CheckCheck, Send } from "lucide-react";
import { postAnnouncement, deleteAnnouncement } from "./announcement-actions";

export default async function TeacherNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const t = await getTranslations("staffNotify");
  const td = await getTranslations("dashboard");

  const canManage = auth.roles.some((r) => isManagement(r));

  // Active announcements (still pinned) + the management user's own sent
  // staff-notification history — both management-only.
  const today = utcMidnight();
  const [announcements, sentRows] = canManage
    ? await Promise.all([
        db.announcement.findMany({
          where: { pinnedUntil: { gte: today } },
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { name: true, staffProfile: { select: { scheduleName: true } } } },
          },
        }),
        db.notification.findMany({
          where: { senderId: auth.userId, type: "STAFF_MESSAGE" },
          select: { title: true, body: true, createdAt: true, read: true, noticedAt: true },
          orderBy: { createdAt: "desc" },
          take: 400,
        }),
      ])
    : [[], []];
  const sentHistory = groupSentNotifications(sentRows);

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
            <DateInput
              id="pinnedUntil"
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

  const sentTab =
    sentHistory.length === 0 ? (
      <p className="text-sm text-slate-400">{t("noSent")}</p>
    ) : (
      <div className="divide-y divide-slate-100">
        {sentHistory.map((b, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{b.title}</p>
              <p className="text-xs text-slate-400">{fmtDisplayDateTime(b.sentAt)}</p>
            </div>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold flex-shrink-0 " +
                (b.seen === b.total
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-slate-50 text-slate-500 border border-slate-200")
              }
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {t("readOf", { seen: b.seen, total: b.total })}
            </span>
          </div>
        ))}
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
            {
              key: "messages",
              label: t("tabMessages"),
              content: (
                <div className="space-y-4">
                  <NotificationsBoard locale={locale} />
                  {/* Sent staff-notification history lives under Notifications (received vs sent),
                      collapsed by default so it doesn't crowd the inbox. */}
                  <details className="group border-t border-slate-100 pt-4">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                      <Send className="w-4 h-4 text-slate-400" />
                      {t("sentHistory")}
                      <span className="font-normal text-slate-400">({sentHistory.length})</span>
                    </summary>
                    <div className="mt-3">{sentTab}</div>
                  </details>
                </div>
              ),
            },
            { key: "announcements", label: td("announcements"), content: announcementsTab },
          ]}
        />
      ) : (
        <NotificationsBoard locale={locale} />
      )}
    </div>
  );
}
