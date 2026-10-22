import { responsibleHeadteachers } from "@/lib/referralStatus";
import { cn } from "@/lib/utils";

/** The «Υπεύθυνος/η Β.Δ.» cell: each student's homegroup headteacher, amber
 *  while they still have students to resolve, muted once done. */
export function ResponsibleHeadteachers({
  students,
}: {
  students: { status: string; headteacher: string | null }[];
}) {
  const rows = responsibleHeadteachers(students);
  if (rows.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <li
          key={r.name ?? "none"}
          className={cn(
            "text-xs whitespace-nowrap",
            r.name === null ? "italic text-red-600" : r.pending ? "font-semibold text-amber-700" : "text-slate-500"
          )}
          title={r.pending ? "Εκκρεμεί απόφαση" : "Ολοκληρώθηκε"}
        >
          {r.name ?? "Χωρίς Β.Δ. τμήματος"}
          {r.name !== null && !r.pending && " ✓"}
        </li>
      ))}
    </ul>
  );
}
