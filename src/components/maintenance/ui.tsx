// Small presentational pieces shared by the maintenance pages. No hooks, so
// they render in server and client components alike.
import { Laptop, Monitor, Projector, Tv, Presentation, Wifi, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Equipment, Status } from "@/lib/maintenance";

export const EQUIPMENT_ICON: Record<Equipment, LucideIcon> = {
  LAPTOP: Laptop,
  COMPUTER: Monitor,
  PROJECTOR: Projector,
  TV: Tv,
  INTERACTIVE_BOARD: Presentation,
  NETWORK: Wifi,
  OTHER: Wrench,
};

const STATUS_CLASS: Record<Status, string> = {
  OPEN: "bg-amber-50 text-amber-700 border-amber-200",
  IN_PROGRESS: "bg-sky-50 text-sky-700 border-sky-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function MaintenanceStatusBadge({ status, label, className }: { status: Status; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_CLASS[status],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function EquipmentIcon({ equipment, className }: { equipment: Equipment; className?: string }) {
  const Icon = EQUIPMENT_ICON[equipment];
  return <Icon className={cn("w-4 h-4", className)} />;
}
