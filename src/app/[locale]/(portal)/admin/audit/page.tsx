import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";
import { utcMidnight, fmtDisplayDateTime } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma";

const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ action?: string; resource?: string; user?: string; from?: string; to?: string; page?: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const sp = await searchParams;
  const action = sp.action?.trim() || "";
  const resource = sp.resource?.trim() || "";
  const userQ = sp.user?.trim() || "";
  const from = sp.from?.trim() || "";
  const to = sp.to?.trim() || "";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(resource ? { resource } : {}),
    ...(userQ
      ? {
          user: {
            OR: [
              { name: { contains: userQ, mode: "insensitive" } },
              { email: { contains: userQ, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: utcMidnight(from) } : {}),
            // inclusive of the whole "to" day
            ...(to ? { lt: new Date(utcMidnight(to).getTime() + DAY_MS) } : {}),
          },
        }
      : {}),
  };

  const [logs, total, actions, resources] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    db.auditLog.findMany({ distinct: ["resource"], select: { resource: true }, orderBy: { resource: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = {
    ...(action ? { action } : {}),
    ...(resource ? { resource } : {}),
    ...(userQ ? { user: userQ } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const pageHref = (p: number) =>
    `?${new URLSearchParams({ ...baseParams, ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;
  const hasFilter = !!(action || resource || userQ || from || to);

  const selectClass = "h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ScrollText className="w-6 h-6" />
          Αρχείο Καταγραφής
        </h2>
        <p className="text-slate-500 text-sm mt-1">{total} {total === 1 ? "εγγραφή" : "εγγραφές"}{hasFilter ? " (φιλτραρισμένες)" : ""}</p>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Ενέργεια</label>
          <select name="action" defaultValue={action} className={selectClass}>
            <option value="">Όλα</option>
            {actions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Πόρος</label>
          <select name="resource" defaultValue={resource} className={selectClass}>
            <option value="">Όλα</option>
            {resources.map((r) => <option key={r.resource} value={r.resource}>{r.resource}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Χρήστης</label>
          <input name="user" defaultValue={userQ} placeholder="όνομα ή email" className={selectClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Από</label>
          <input type="date" name="from" defaultValue={from} className={selectClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Έως</label>
          <input type="date" name="to" defaultValue={to} className={selectClass} />
        </div>
        <button type="submit" className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          Εφαρμογή
        </button>
        {hasFilter && (
          <Link href="?" className="h-9 px-3 flex items-center text-sm text-slate-500 hover:text-slate-800">Καθαρισμός</Link>
        )}
      </form>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Πότε</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Χρήστης</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Ενέργεια</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Πόρος</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Λεπτομέρειες</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((l) => {
                const details = l.details != null ? JSON.stringify(l.details) : "";
                return (
                  <tr key={l.id} className="hover:bg-slate-50 align-top">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{fmtDisplayDateTime(l.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{l.user?.name ?? "—"}</span>
                      <span className="block text-xs text-slate-400">{l.user?.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs font-mono">{l.action}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {l.resource}
                      {l.resourceId && <span className="block font-mono text-[11px] text-slate-400">{l.resourceId}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-md">
                      {details ? <code className="text-[11px] break-all line-clamp-2" title={details}>{details}</code> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{l.ipAddress ?? "—"}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-slate-400">
                    <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Δεν βρέθηκαν εγγραφές
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Σελίδα {page} από {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="h-8 px-3 flex items-center rounded-lg border border-slate-200 hover:bg-slate-50">Προηγούμενη</Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="h-8 px-3 flex items-center rounded-lg border border-slate-200 hover:bg-slate-50">Επόμενη</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
