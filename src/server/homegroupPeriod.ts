import { db } from "@/server/db";
import { isHomegroupWhere } from "@/lib/homegroupFilter";

/** Every homegroup, for the «Υπευθυνότητα Τμήματος» picker (any teacher may take one). */
export async function getHomegroupOptions(): Promise<{ id: string; name: string }[]> {
  const groups = await db.group.findMany({ where: isHomegroupWhere(), select: { id: true, name: true } });
  return groups.sort((a, b) => a.name.localeCompare(b.name, "el", { numeric: true }));
}

/** The viewer's own homegroups (as homegroup teacher or deputy), deduplicated. */
export function ownHomegroups(staff: {
  homeroomGroups?: { id: string; name: string }[];
  homeroomHeadGroups?: { id: string; name: string }[];
} | null): { id: string; name: string }[] {
  if (!staff) return [];
  return [...(staff.homeroomGroups ?? []), ...(staff.homeroomHeadGroups ?? [])].filter(
    (g, i, arr) => arr.findIndex((x) => x.id === g.id) === i,
  );
}
