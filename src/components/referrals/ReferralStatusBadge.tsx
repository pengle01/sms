import { referralColor, type ReferralColor } from "@/lib/referralStatus";

const COLOR_STYLES: Record<ReferralColor, { dot: string; pill: string; label: string; border: string; leftAccent: string }> = {
  RED:    { dot: "bg-red-500",    pill: "bg-red-50 text-red-700 border-red-200",       label: "Νέα — δεν ανοίχτηκε", border: "border-red-400",    leftAccent: "border-l-4 border-l-red-400" },
  YELLOW: { dot: "bg-amber-400",  pill: "bg-amber-50 text-amber-700 border-amber-200", label: "Σε εξέλιξη",          border: "border-amber-400",  leftAccent: "border-l-4 border-l-amber-400" },
  GREEN:  { dot: "bg-green-500",  pill: "bg-green-50 text-green-700 border-green-200",  label: "Ολοκληρώθηκε",        border: "border-green-400",  leftAccent: "border-l-4 border-l-green-400" },
  GRAY:   { dot: "bg-slate-300",  pill: "bg-slate-100 text-slate-500 border-slate-200", label: "Πρόχειρο",            border: "border-slate-300",  leftAccent: "border-l-4 border-l-slate-300" },
};

type ReferralLike = { isDraft: boolean; openedAt?: Date | string | null; students: { status: string }[] };

type Props = {
  referral: ReferralLike;
  className?: string;
};

// Full-border colour class for the whole card (e.g. "border-2 " + this).
export function referralBorderClass(referral: ReferralLike): string {
  return COLOR_STYLES[referralColor(referral)].border;
}

// Left-accent colour bar for table rows.
export function referralLeftAccentClass(referral: ReferralLike): string {
  return COLOR_STYLES[referralColor(referral)].leftAccent;
}

// At-a-glance traffic-light status. Visible to anyone who can see the referral.
export function ReferralStatusBadge({ referral, className = "" }: Props) {
  const color = referralColor(referral);
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
export function ReferralStatusDot({ referral, className = "" }: Props) {
  const color = referralColor(referral);
  const s = COLOR_STYLES[color];
  return (
    <span
      title={s.label}
      className={`inline-block w-2.5 h-2.5 rounded-full ${s.dot} ${className}`}
      aria-label={s.label}
    />
  );
}
