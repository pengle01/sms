"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Room picker for the rooms tab: navigates on change, keeping the other params. */
export function RoomSelect({ rooms, value, allLabel }: { rooms: string[]; value: string; allLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      value={value}
      onChange={(e) => {
        const sp = new URLSearchParams(searchParams);
        if (e.target.value) sp.set("room", e.target.value);
        else sp.delete("room");
        router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
      }}
      className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
    >
      <option value="">{allLabel}</option>
      {rooms.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
