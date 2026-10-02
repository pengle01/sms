import { Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";

export type WaitingSeverity = "ok" | "warn" | "overdue";

const STYLES: Record<WaitingSeverity, { ring: string; icon: string; speed: string }> = {
  ok:      { ring: "bg-emerald-400", icon: "text-emerald-600", speed: "2.4s" },
  warn:    { ring: "bg-amber-400",   icon: "text-amber-600",   speed: "1.6s" },
  overdue: { ring: "bg-red-500",     icon: "text-red-600",     speed: "0.9s" },
};

/**
 * "Still out, still waiting": an hourglass that keeps turning over inside a
 * ripple. The longer the break, the warmer the colour and the faster it turns.
 * Motion is dropped for users who ask for reduced motion (ripple via motion-safe).
 */
export function WaitingIndicator({ severity, size = "sm" }: { severity: WaitingSeverity; size?: "sm" | "md" }) {
  const s = STYLES[severity];
  const box = size === "md" ? "w-5 h-5" : "w-4 h-4";
  const icon = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <span className={cn("relative inline-flex flex-shrink-0 items-center justify-center", box)} aria-hidden>
      <span className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", s.ring)} />
      <Hourglass
        className={cn("relative animate-hourglass", icon, s.icon)}
        style={{ "--hourglass-speed": s.speed } as React.CSSProperties}
        strokeWidth={2.5}
      />
    </span>
  );
}
