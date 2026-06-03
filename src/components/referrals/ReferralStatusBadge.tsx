import {
  referralColor,
  referralColorScoped,
  referralGroupSignals,
  type ReferralColor,
} from "@/lib/referralStatus";

const COLOR_STYLES: Record<ReferralColor, { dot: string; pill: string; label: string; border: string; leftAccent: string }> = {
  RED:    { dot: "bg-red-500",    pill: "bg-red-50 text-red-700 border-red-200",       label: "Νέα — δεν ανοίχτηκε", border: "border-red-400",    leftAccent: "border-l-4 border-l-red-400" },
  YELLOW: { dot: "bg-amber-400",  pill: "bg-amber-50 text-amber-700 border-amber-200", label: "Σε εξέλιξη",          border: "border-amber-400",  leftAccent: "border-l-4 border-l-amber-400" },
  GREEN:  { dot: "bg-green-500",  pill: "bg-green-50 text-green-700 border-green-200",  label: "Ολοκληρώθηκε",        border: "border-green-400",  leftAccent: "border-l-4 border-l-green-400" },
  GRAY:   { dot: "bg-slate-300",  pill: "bg-slate-100 text-slate-500 border-slate-200", label: "Πρόχειρο",            border: "border-slate-300",  leftAccent: "border-l-4 border-l-slate-300" },
};

type ReferralLike = {
  isDraft: boolean;
  openedAt?: Date | string | null;
  students: { status: string; groupId?: string | null }[];
};

type Props = {
  referral: ReferralLike;
  // When set, the colour reflects only the students in these homegroups — used
  // so a headteacher sees their own progress rather than the whole referral's.
  scopeGroupIds?: string[];
  className?: string;
};

// Full-border colour class for the whole card (e.g. "border-2 " + this).
export function referralBorderClass(referral: ReferralLike, scopeGroupIds?: string[]): string {
  return COLOR_STYLES[referralColorScoped(referral, scopeGroupIds)].border;
}

// Left-accent colour bar for table rows.
export function referralLeftAccentClass(referral: ReferralLike, scopeGroupIds?: string[]): string {
  return COLOR_STYLES[referralColorScoped(referral, scopeGroupIds)].leftAccent;
}

// At-a-glance traffic-light status. Visible to anyone who can see the referral.
export function ReferralStatusBadge({ referral, scopeGroupIds, className = "" }: Props) {
  const color = referralColorScoped(referral, scopeGroupIds);
  const s = COLOR_STYLES[color];
  return (
    <span
      title={s.label}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${s.pill} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

// Just the coloured dot, for compact rows.
export function ReferralStatusDot({ referral, scopeGroupIds, className = "" }: Props) {
  const color = referralColorScoped(referral, scopeGroupIds);
  const s = COLOR_STYLES[color];
  return (
    <span
      title={s.label}
      className={`inline-block w-2.5 h-2.5 rounded-full ${s.dot} ${className}`}
      aria-label={s.label}
    />
  );
}

// Per-headteacher signalling: one labelled dot per homegroup involved, each
// coloured by that group's own progress. Only renders when more than one group
// (i.e. more than one headteacher) is involved — for a single group the main
// badge already says everything.
type SignalStudent = { groupId?: string | null; status: string; group?: { name: string | null } | null };
export function ReferralGroupSignals({
  referral,
  className = "",
}: {
  referral: { isDraft: boolean; openedAt?: Date | string | null; students: SignalStudent[] };
  className?: string;
}) {
  const signals = referralGroupSignals(referral);
  if (signals.length < 2) return null;

  const nameByGroup = new Map<string, string>();
  for (const s of referral.students) {
    if (s.groupId && s.group?.name) nameByGroup.set(s.groupId, s.group.name);
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {signals.map((sig) => {
        const st = COLOR_STYLES[sig.color];
        const name = nameByGroup.get(sig.groupId) ?? "";
        return (
          <span
            key={sig.groupId}
            title={`${name} · ${st.label}`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500"
          >
            <span className={`w-2 h-2 rounded-full ${st.dot}`} aria-hidden />
            {name}
          </span>
        );
      })}
    </div>
  );
}
