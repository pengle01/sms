// Editing a student (admin and office). Pure so the rules are unit-tested.

/** Which portal the edit form was opened from — Back/Cancel and the save return there. */
export type StudentEditPortal = "admin" | "office";

/**
 * The registry-number change to record in the audit log, or null when there is
 * none. An empty new value is ignored by the save, so it is not a change.
 */
export function registryChange(before: string, after: string): { from: string; to: string } | null {
  const from = before.trim();
  const to = after.trim();
  if (!to || to === from) return null;
  return { from, to };
}
