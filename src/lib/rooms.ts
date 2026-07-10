// Room helpers. The live room list is the `Room` table, managed by the super
// admin (Settings → Rooms) and read via getRooms() in src/server/rooms.ts;
// DEFAULT_ROOMS below seeds an empty table. Transcribed from the school's
// rooms Excel (αίθουσεςnew.xlsx, 2026-07-10) in the file's original order:
// special rooms, then per-building numbering.
export interface Room {
  name: string;
  capacity: number;
}

export const DEFAULT_ROOMS: Room[] = [
  { name: "ΒΙΒΛ", capacity: 8 },
  { name: "ΙΑΤΡ", capacity: 1 },
  { name: "107", capacity: 1 },
  { name: "6Β", capacity: 24 },
  { name: "5", capacity: 16 },
  { name: "6", capacity: 8 },
  { name: "10", capacity: 24 },
  { name: "11", capacity: 24 },
  { name: "12", capacity: 24 },
  { name: "13", capacity: 24 },
  { name: "16", capacity: 24 },
  { name: "17", capacity: 24 },
  { name: "18", capacity: 24 },
  { name: "19", capacity: 24 },
  { name: "20", capacity: 10 },
  { name: "24", capacity: 14 },
  { name: "24α", capacity: 10 },
  { name: "25", capacity: 24 },
  { name: "27", capacity: 24 },
  { name: "30", capacity: 17 },
  { name: "32", capacity: 14 },
  { name: "33", capacity: 14 },
  { name: "37", capacity: 24 },
  { name: "38", capacity: 12 },
  { name: "39", capacity: 16 },
  { name: "40", capacity: 24 },
  { name: "41", capacity: 18 },
  { name: "42", capacity: 18 },
  { name: "43", capacity: 14 },
  { name: "43α", capacity: 7 },
  { name: "44", capacity: 14 },
  { name: "45", capacity: 12 },
  { name: "47", capacity: 12 },
  { name: "49", capacity: 12 },
  { name: "50", capacity: 12 },
  { name: "50α", capacity: 14 },
  { name: "53", capacity: 19 },
  { name: "54", capacity: 14 },
  { name: "57", capacity: 14 },
  { name: "58", capacity: 14 },
  { name: "59", capacity: 14 },
  { name: "60", capacity: 14 },
  { name: "61", capacity: 14 },
  { name: "Β54", capacity: 14 },
  { name: "Β57", capacity: 14 },
  { name: "Β58", capacity: 14 },
  { name: "Β59", capacity: 14 },
  { name: "Β60", capacity: 14 },
  { name: "Β61", capacity: 14 },
  { name: "104", capacity: 24 },
  { name: "106", capacity: 24 },
  { name: "111", capacity: 14 },
  { name: "112", capacity: 14 },
  { name: "113", capacity: 14 },
  { name: "114", capacity: 14 },
  { name: "117", capacity: 14 },
  { name: "118", capacity: 14 },
  { name: "119", capacity: 24 },
  { name: "120", capacity: 24 },
  { name: "121", capacity: 20 },
  { name: "122", capacity: 16 },
  { name: "123", capacity: 16 },
  { name: "124", capacity: 16 },
  { name: "124α", capacity: 8 },
  { name: "125", capacity: 16 },
  { name: "125α", capacity: 14 },
  { name: "126", capacity: 14 },
  { name: "127", capacity: 16 },
  { name: "128", capacity: 8 },
  { name: "129", capacity: 16 },
  { name: "129α", capacity: 14 },
  { name: "130", capacity: 24 },
  { name: "131", capacity: 16 },
  { name: "131α", capacity: 16 },
  { name: "132", capacity: 16 },
  { name: "132α", capacity: 10 },
  { name: "133", capacity: 16 },
  { name: "133α", capacity: 16 },
  { name: "134", capacity: 16 },
  { name: "136", capacity: 16 },
  { name: "137", capacity: 16 },
  { name: "138", capacity: 24 },
  { name: "138α", capacity: 24 },
  { name: "ΓΗΠ1", capacity: 24 },
  { name: "ΓΗΠ2", capacity: 24 },
  { name: "ΓΗΠ3", capacity: 24 },
  { name: "Λ1", capacity: 24 },
  { name: "Λ2", capacity: 24 },
  { name: "Λ3", capacity: 24 },
];

/**
 * Pick a relocation room for a displaced class: the largest-capacity room not
 * in use that period (ties broken by list order). The class size is unknown at
 * planning time, so biggest-first keeps tiny rooms (ΙΑΤΡ, 107) as last resorts.
 * «κιόσκια» is not a room (the study-hall code for staying in the yard) and is
 * never a candidate — it is never on the room list.
 */
export function pickFreeRoom(usedRooms: ReadonlySet<string>, rooms: Room[]): string | null {
  const candidates = [...rooms].sort((a, b) => b.capacity - a.capacity);
  return candidates.find((r) => !usedRooms.has(r.name))?.name ?? null;
}

export const ROOM_NAME_MAX = 20;
export const ROOM_CAPACITY_MAX = 999;

export type ParsedRoomInput = { ok: true; name: string; capacity: number } | { ok: false; error: "name" | "capacity" };

/** Validate an admin add-room submission (name trimmed, capacity a positive int). */
export function parseRoomInput(name: string, capacity: number): ParsedRoomInput {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > ROOM_NAME_MAX) return { ok: false, error: "name" };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > ROOM_CAPACITY_MAX) {
    return { ok: false, error: "capacity" };
  }
  return { ok: true, name: trimmed, capacity };
}

/** Display/order comparator: numeric-aware Greek collation ("6Β" before "24α" before "107"). */
export function roomOrder(a: Room, b: Room): number {
  return a.name.localeCompare(b.name, "el", { numeric: true });
}
