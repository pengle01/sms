import { db } from "@/server/db";
import { availableChaperoneNames, chaperoneNameKey } from "@/lib/chaperone";

/**
 * Names on the admin's chaperone list without an account yet — offered at
 * sign-up and re-checked by its action, so a name can't be offered by one and
 * refused by the other.
 */
export async function loadAvailableChaperoneNames(): Promise<string[]> {
  const [entries, accounts] = await Promise.all([
    db.chaperoneListEntry.findMany({ select: { name: true, nameKey: true }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ where: { role: "CHAPERONE" }, select: { name: true } }),
  ]);
  return availableChaperoneNames(entries, new Set(accounts.map((a) => chaperoneNameKey(a.name))));
}
