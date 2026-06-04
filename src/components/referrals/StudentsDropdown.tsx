import { ChevronDown } from "lucide-react";
import { StudentInfoDialog } from "./StudentInfoDialog";

export type StudentItem = {
  referralStudentId: string;
  studentId: string;
  name: string;
  group: string | null;
  status: string; // PENDING | RESOLVED
  actionLabel: string | null; // shown when resolved
  actionDetails?: string | null; // punishment description (tooltip)
  referralId: string;
};

function StatusBadge({ status, actionLabel, actionDetails }: { status: string; actionLabel: string | null; actionDetails?: string | null }) {
  if (status === "RESOLVED") {
    return (
      <span
        title={actionDetails ?? undefined}
        className="inline-block text-[10px] px-1.5 py-0 leading-4 rounded border bg-green-50 text-green-700 border-green-200"
      >
        {actionLabel ?? "Επιλύθηκε"}
      </span>
    );
  }
  return (
    <span className="inline-block text-[10px] px-1.5 py-0 leading-4 rounded border bg-amber-50 text-amber-700 border-amber-200">
      Εκκρεμής
    </span>
  );
}

function StudentRow({ s, canViewInfo }: { s: StudentItem; canViewInfo: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-slate-800 font-medium">{s.name}</span>
      {s.group && <span className="text-xs text-slate-400">{s.group}</span>}
      <StatusBadge status={s.status} actionLabel={s.actionLabel} actionDetails={s.actionDetails} />
      {canViewInfo && (
        <StudentInfoDialog studentId={s.studentId} excludeReferralId={s.referralId} studentName={s.name} />
      )}
    </div>
  );
}

// Lists referral students. A single student renders inline; multiple students
// collapse into a native <details> dropdown (no overflow clipping in tables).
export function StudentsDropdown({
  students,
  canViewInfo = false,
}: {
  students: StudentItem[];
  canViewInfo?: boolean;
}) {
  if (students.length === 0) return <span className="text-slate-400 text-sm">—</span>;
  if (students.length === 1) return <StudentRow s={students[0]!} canViewInfo={canViewInfo} />;

  const resolved = students.filter((s) => s.status === "RESOLVED").length;

  return (
    <details className="group">
      <summary className="list-none cursor-pointer select-none inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-medium text-slate-700 touch-manipulation [&::-webkit-details-marker]:hidden">
        {students.length} μαθητές
        <span className="text-xs text-slate-400">({resolved}/{students.length})</span>
        <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-1.5 ml-1 pl-2.5 border-l-2 border-slate-100 space-y-1.5">
        {students.map((s) => (
          <StudentRow key={s.referralStudentId} s={s} canViewInfo={canViewInfo} />
        ))}
      </div>
    </details>
  );
}
