import { db } from "@/server/db";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { MessageSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { utcMidnight, fmtDisplayDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  SMS_KINDS,
  SMS_STATUSES,
  SMS_LOG_PAGE_SIZE,
  parseSmsKind,
  parseSmsStatus,
  parseSmsLogPage,
  smsLogPageCount,
  smsLogWhere,
  smsSenderLabel,
} from "@/lib/smsLog";
import type { Prisma } from "@/generated/prisma/client";

export interface SmsLogParams {
  from?: string;
  to?: string;
  status?: string;
  kind?: string;
  q?: string;
  page?: string;
}

const KIND_COLOR: Record<string, string> = {
  BROADCAST: "bg-sky-50 text-sky-700 border-sky-200",
  ABSENCE:   "bg-amber-50 text-amber-700 border-amber-200",
  REFERRAL:  "bg-violet-50 text-violet-700 border-violet-200",
};

/**
 * The sent-SMS log — read-only, shared by the office and the admin portal.
 *
 * Its whole job is verification: what text went out, to which number, for which
 * student, who is answerable for it, and whether the gateway took it. There is
 * deliberately no resend, no edit and no delete — a message that has left is a
 * fact, and a log you can change is not evidence.
 */
export async function SmsLogView({ params }: { params: SmsLogParams }) {
  const t = await getTranslations("smsLog");

  const fromStr = params.from?.trim() || "";
  const toStr = params.to?.trim() || "";
  const q = params.q?.trim() || "";
  const status = parseSmsStatus(params.status);
  const kind = parseSmsKind(params.kind);
  const page = parseSmsLogPage(params.page);

  const where = smsLogWhere({
    from: fromStr ? utcMidnight(fromStr) : null,
    to: toStr ? utcMidnight(toStr) : null,
    status,
    kind,
    q,
  }) as Prisma.SmsLogWhereInput;

  const [rows, total, failedTotal] = await Promise.all([
    db.smsLog.findMany({
      where,
      select: {
        id: true,
        phoneNumber: true,
        message: true,
        status: true,
        kind: true,
        sentAt: true,
        gatewayResponse: true,
        student: { select: { studentId: true, user: { select: { name: true } } } },
        sentBy: { select: { name: true, staffProfile: { select: { scheduleName: true } } } },
      },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * SMS_LOG_PAGE_SIZE,
      take: SMS_LOG_PAGE_SIZE,
    }),
    db.smsLog.count({ where }),
    db.smsLog.count({ where: { ...where, status: "FAILED" } }),
  ]);

  const totalPages = smsLogPageCount(total);
  const base = {
    ...(fromStr ? { from: fromStr } : {}),
    ...(toStr ? { to: toStr } : {}),
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
    ...(q ? { q } : {}),
  };
  const pageHref = (p: number) =>
    `?${new URLSearchParams({ ...base, ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;
  const hasFilter = Object.keys(base).length > 0;

  const field =
    "h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {t("messageCount", { count: total })}
          {hasFilter && ` ${t("filtered")}`}
          {failedTotal > 0 && (
            <span className="text-red-600 font-medium"> · {t("failedCount", { count: failedTotal })}</span>
          )}
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("from")}</label>
          <DateInput name="from" defaultValue={fromStr} className={field} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("to")}</label>
          <DateInput name="to" defaultValue={toStr} className={field} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("filterKind")}</label>
          <select name="kind" defaultValue={kind ?? ""} className={field}>
            <option value="">{t("all")}</option>
            {SMS_KINDS.map((k) => (
              <option key={k} value={k}>{t(`kind_${k}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("filterStatus")}</label>
          <select name="status" defaultValue={status ?? ""} className={field}>
            <option value="">{t("all")}</option>
            {SMS_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`status_${s}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">{t("filterSearch")}</label>
          <input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className={cn(field, "w-56")} />
        </div>
        <button
          type="submit"
          className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          {t("apply")}
        </button>
        {hasFilter && (
          <Link href="?" className="h-9 px-3 flex items-center text-sm text-slate-500 hover:text-slate-800">
            {t("clear")}
          </Link>
        )}
      </form>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colWhen")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colStudent")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colPhone")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colMessage")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colKind")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colSender")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                // The schedule coding is how staff know each other; fall back to
                // the account name for the office, who have no coding.
                const sentByName =
                  r.sentBy?.staffProfile?.scheduleName ?? r.sentBy?.name ?? null;
                const sender = smsSenderLabel(
                  { kind: r.kind, sentByName },
                  { automatic: (n) => t("sentAutomatically", { name: n }), unknown: t("senderUnknown") },
                );
                const failed = r.status === "FAILED";
                return (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{fmtDisplayDateTime(r.sentAt)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{r.student.user?.name ?? "—"}</span>
                      <span className="block font-mono text-[11px] text-slate-400">{r.student.studentId}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.phoneNumber}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-md">
                      <span className="line-clamp-2" title={r.message}>{r.message}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.kind ? (
                        <Badge variant="outline" className={cn("text-xs", KIND_COLOR[r.kind])}>
                          {t(`kind_${r.kind}`)}
                        </Badge>
                      ) : (
                        // Written before the log recorded a source. Saying so beats
                        // guessing in a screen whose only value is being trusted.
                        <span className="text-xs text-slate-300">{t("kindUnknown")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{sender}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-medium",
                          failed
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200",
                        )}
                      >
                        {t(`status_${r.status}`)}
                      </Badge>
                      {failed && r.gatewayResponse && (
                        <span className="block text-[11px] text-red-500 max-w-48 truncate" title={r.gatewayResponse}>
                          {r.gatewayResponse}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                    <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {hasFilter ? t("noMatches") : t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{t("pageOf", { page, total: totalPages })}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="h-8 px-3 flex items-center rounded-lg border border-slate-200 hover:bg-slate-50">
                {t("previous")}
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="h-8 px-3 flex items-center rounded-lg border border-slate-200 hover:bg-slate-50">
                {t("next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
