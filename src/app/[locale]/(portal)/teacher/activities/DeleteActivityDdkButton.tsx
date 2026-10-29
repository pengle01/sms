"use client";

import { Trash2 } from "lucide-react";
import { removeActivityDdk } from "./actions";

// Removes a whole activity's ΔΔΚ awards (with a confirm) — on «Τα ΔΔΚ μου».
// The activity itself stays. activityId null = awards of a deleted activity.
export function DeleteActivityDdkButton({
  activityId,
  schoolYear,
  label,
  confirmText,
}: {
  activityId: string | null;
  schoolYear: string;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={removeActivityDdk}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="activityId" value={activityId ?? ""} />
      <input type="hidden" name="schoolYear" value={schoolYear} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        {label}
      </button>
    </form>
  );
}
