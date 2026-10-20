"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StudentPicker, type PickerGroup } from "@/components/students/StudentPicker";
import { addParticipants, removeParticipant } from "../actions";

/**
 * Add students from any homegroups in one go. Saves without leaving the page:
 * the list refreshes in place, so the teacher keeps their scroll position.
 */
export function AddParticipants({
  activityId,
  groups,
  participantIds,
}: {
  activityId: string;
  groups: PickerGroup[];
  participantIds: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("activityId", activityId);
      for (const id of selected) fd.append("studentId", id);
      await addParticipants(fd);
      setSelected([]);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <StudentPicker groups={groups} selectedIds={selected} onChange={setSelected} disabledIds={participantIds} />
      <button
        type="button"
        disabled={pending || selected.length === 0}
        onClick={add}
        className="inline-flex items-center gap-2 h-9 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        Προσθήκη επιλεγμένων{selected.length > 0 ? ` (${selected.length})` : ""}
      </button>
    </div>
  );
}

/** Remove one participant, refreshing in place. */
export function RemoveParticipantButton({ activityId, studentId }: { activityId: string; studentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("activityId", activityId);
          fd.set("studentId", studentId);
          await removeParticipant(fd);
          router.refresh();
        })
      }
      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
      title="Αφαίρεση"
      aria-label="Αφαίρεση"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XIcon />}
    </button>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
