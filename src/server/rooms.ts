import { db } from "@/server/db";
import { DEFAULT_ROOMS, roomOrder } from "@/lib/rooms";

export interface RoomRow {
  id: string;
  name: string;
  capacity: number;
}

/**
 * The school's room list, sorted for display. An empty table is seeded once
 * from DEFAULT_ROOMS (the transcribed school Excel) so a fresh database starts
 * with the real rooms instead of nothing.
 */
export async function getRooms(): Promise<RoomRow[]> {
  let rooms = await db.room.findMany();
  if (rooms.length === 0) {
    await db.room.createMany({ data: DEFAULT_ROOMS, skipDuplicates: true });
    rooms = await db.room.findMany();
  }
  return rooms.sort(roomOrder);
}
