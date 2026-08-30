import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveAuth } from "@/server/authz";
import { db } from "@/server/db";
import { canManageAnnouncements, canDeleteAnnouncement, announcementErrorKey } from "@/lib/announcements";
import { canSendStaffNotifications, groupSentNotifications } from "@/lib/staffNotifications";
import { staffAuthorLabel } from "@/lib/staffName";
import { getActiveAnnouncements } from "@/server/announcements";
import { getTranslations } from "next-intl/server";
import { utcMidnight, localDateStr, fmtDisplayDate, fmtDisplayDateTime } from "@/lib/dates";
import { NotificationsBoard } from "@/components/notifications/NotificationsBoard";
import { ReferralTabs } from "@/components/referrals/ReferralTabs";
import { PenSquare, X, CheckCheck, Send } from "lucide-react";
import { postAnnouncement, deleteAnnouncement } from "@/components/announcements/announcement-actions";
import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { AttachmentList } from "@/components/attachments/AttachmentLink";

/**
 * The staff notifications hub: the inbox, the sent history, and the
 * announcement composer.
 *
 * Shared by the teacher portal and the office, because what a reader may do
 * here follows from their role, not from the URL. `hub` is the portal's own
 * path — the two live at different addresses (/teacher/noticeboard and
 * /office/notifications), so links and the composer's return target are passed
 * in rather than guessed.
 */
export async function StaffNotificationsHub({
  locale,
  hub,
  error,
}: {
  locale: string;
  hub: string;
  /** `?error=` forwarded by the composer's redirect. */
  error?: string;
}) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const t = await getTranslations("staffNotify");
  const td = await getTranslations("dashboard");
  const tn = await getTranslations("notifications");

  const canManage = canManageAnnouncements(auth.roles);
  const canSend = canSendStaffNotifications(auth.roles);
  const announcementError = announcementErrorKey(error);

  // The two halves are gated separately: announcements belong to whoever may
  // post them, the sent history to whoever may send. The counselor may send but
  // not post, so keying both off one flag would hide their own sent messages.
  const today = utcMidnight();
  const [announcements, sentRows] = await Promise.all([
    canManage ? getActiveAnnouncements(today) : [],
    canSend
      ? db.notification.findMany({
          where: { senderId: auth.userId, type: "STAFF_MESSAGE" },
          select: { title: true, body: true, createdAt: true, read: true, noticedAt: true },
          orderBy: { createdAt: "desc" },
          take: 400,
        })
      : [],
  ]);
  const sentHistory = groupSentNotifications(sentRows);

  const todayIso = localDateStr();

  const announcementsTab = (
    <div className="space-y-3">
      <AnnouncementComposer action={postAnnouncement.bind(null, locale, hub)} todayIso={todayIso} />

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
                <AttachmentList files={a.files} className="mt-2" />
                <p className="text-xs text-slate-400 mt-1">
                  {staffAuthorLabel(
                    { role: a.author.role, name: a.author.name, scheduleName: a.author.staffProfile?.scheduleName },
                    td("officeAuthor"),
                  )}{" "}
                  · {td("showUntil")}{" "}
                  {fmtDisplayDate(a.pinnedUntil)}
                </p>
              </div>
              {canDeleteAnnouncement(auth.roles, a.authorId, auth.userId) && (
                <form action={deleteAnnouncement.bind(null, locale, hub)}>
                  <input type="hidden" name="id" value={a.id} />
                  <button
                    type="submit"
                    aria-label={td("deleteAnnouncement")}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              )}
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
      {announcementError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {td(`err_${announcementError}`)}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900">{tn("title")}</h2>
        {/* Management and the office compose ad-hoc messages to teachers */}
        {canSend && (
          <Link
            href={`${hub}/compose`}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <PenSquare className="w-4 h-4" />
            {t("newMessage")}
          </Link>
        )}
      </div>

      {canManage || canSend ? (
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
            ...(canManage
              ? [{ key: "announcements", label: td("announcements"), content: announcementsTab }]
              : []),
          ]}
        />
      ) : (
        <NotificationsBoard locale={locale} />
      )}
    </div>
  );
}
