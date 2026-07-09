"use client";

import { Loader2, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared footer for the settings cards: values are read-only until "Edit" is
 * pressed; while editing, Save applies and Cancel restores the stored values.
 */
export function EditControls({
  editing,
  pending,
  saved = false,
  canSave = true,
  onEdit,
  onCancel,
  onSave,
}: {
  editing: boolean;
  pending: boolean;
  saved?: boolean;
  canSave?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-2 pt-1">
        {saved && <Check className="w-4 h-4 text-emerald-500" />}
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          Επεξεργασία
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
        Άκυρο
      </Button>
      <Button
        size="sm"
        onClick={onSave}
        disabled={pending || !canSave}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Αποθήκευση
      </Button>
    </div>
  );
}
