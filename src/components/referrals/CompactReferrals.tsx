import Link from "next/link";
import { AlertTriangle, LayoutList, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import { compactReferralTitle } from "@/lib/referralLabels";
import { ReferralStatusBadge, referralLeftAccentClass } from "./ReferralStatusBadge";

type StaffNameish = Parameters<typeof staffDisplayName>[0];

/** What the compact list needs from a referral (the pages' own includes provide it). */
export interface CompactReferral {
  id: string;
  number: number;
  date: Date;
  title: string | null;
  description: string;
  isDraft: boolean;
  openedAt?: Date | null;
  filer: StaffNameish;
  students: { id: string; status: string; groupId: string | null; student: { user: { name: string | null } | null }; group: { name: string } | null }[];
}

/**
 * «Συμπαγής» view of a referral list: one line per referral — the student(s),
 * the teacher who filed it and the title (the description's start when there
 * is no title), with its number, date and status. `numberHref` opens a
 * referral in the full view (by its number), where the page can search.
 */
export function CompactReferralTable({
  referrals,
  numberHref,
  scopeGroupIds,
  empty,
}: {
  referrals: CompactReferral[];
  numberHref?: (number: number) => string;
  /** Show only these homegroups' students (a deputy's own), as the full view does. */
  scopeGroupIds?: string[];
  empty: string;
}) {
  const th = "text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide";
  return (
    <table className="w-full text-sm min-w-[640px]">
      <thead>
        <tr className="border-b border-slate-100">
          <th className={th}>Αρ.</th>
          <th className={th}>Μαθητής/τρια</th>
          <th className={th}>Καταγγέλλων</th>
          <th className={th}>Τίτλος</th>
          <th className={th}>Κατάσταση</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {referrals.map((r) => {
          const students = scopeGroupIds
            ? r.students.filter((rs) => rs.groupId && scopeGroupIds.includes(rs.groupId))
            : r.students;
          const title = compactReferralTitle(r);
          return (
            <tr key={r.id} className={cn("hover:bg-slate-50", referralLeftAccentClass(r, scopeGroupIds))}>
              <td className="px-4 py-2 whitespace-nowrap">
                {numberHref ? (
                  <Link href={numberHref(r.number)} className="font-semibold text-slate-700 hover:text-emerald-700 hover:underline">
                    #{r.number}
                  </Link>
                ) : (
                  <span className="font-semibold text-slate-700">#{r.number}</span>
                )}
                <span className="block text-[11px] text-slate-400">{fmtDisplayDate(r.date)}</span>
              </td>
              <td className="px-4 py-2 text-slate-900">
                {students.map((rs, i) => (
                  <span key={rs.id} className="whitespace-nowrap">
                    {rs.student.user?.name ?? "—"}
                    {rs.group && <span className="ml-1 text-xs text-slate-400">{rs.group.name}</span>}
                    {i < students.length - 1 && <span className="text-slate-300">, </span>}
                  </span>
                ))}
              </td>
              <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{staffDisplayName(r.filer)}</td>
              <td className={cn("px-4 py-2 max-w-sm truncate", title.fromTitle ? "font-medium text-slate-800" : "italic text-slate-500")} title={title.text}>
                {title.text}
              </td>
              <td className="px-4 py-2">
                <ReferralStatusBadge referral={r} scopeGroupIds={scopeGroupIds} />
              </td>
            </tr>
          );
        })}
        {referrals.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** «Πλήρης | Συμπαγής» — the two views of the referral lists. */
export function ReferralViewToggle({ compact, fullHref, compactHref }: { compact: boolean; fullHref: string; compactHref: string }) {
  const btn = (active: boolean) =>
    cn(
      "h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium transition-colors",
      active ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:text-emerald-700",
    );
  return (
    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
      <Link href={fullHref} className={btn(!compact)}>
        <LayoutList className="w-4 h-4" />
        Πλήρης
      </Link>
      <Link href={compactHref} className={cn(btn(compact), "border-l border-slate-200")}>
        <Rows3 className="w-4 h-4" />
        Συμπαγής
      </Link>
    </div>
  );
}
