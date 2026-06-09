"use client";

import { useState } from "react";

export function SelectAllButton({ formId }: { formId: string }) {
  const [allSelected, setAllSelected] = useState(false);

  const toggle = () => {
    const boxes = document.querySelectorAll<HTMLInputElement>(
      `#${formId} input[name="studentId"], input[form="${formId}"][name="studentId"]`
    );
    const next = !allSelected;
    boxes.forEach((cb) => { cb.checked = next; });
    setAllSelected(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
    >
      {allSelected ? "Αποεπιλογή όλων" : "Επιλογή όλων"}
    </button>
  );
}
