"use client";

import { Trash2 } from "lucide-react";
import { deleteActivity } from "./actions";

// Deletes the activity (with a confirm) — used in the activity's edit mode and,
// compactly, next to each "my activities" row on the list.
export function DeleteActivityButton({
  activityId,
  locale,
  compact = false,
}: {
  activityId: string;
  locale: string;
  compact?: boolean;
}) {
  return (
    <form
      action={deleteActivity}
      onSubmit={(e) => {
        if (!confirm("Να διαγραφεί οριστικά αυτή η δραστηριότητα;")) e.preventDefault();
      }}
    >
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        className={
          compact
            ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50"
            : "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50"
        }
      >
        <Trash2 className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        {compact ? "Διαγραφή" : "Διαγραφή δραστηριότητας"}
      </button>
    </form>
  );
}
