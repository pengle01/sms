import { db } from "@/server/db";
import type { PickerGroup } from "@/components/students/StudentPicker";

/** Active students grouped by homegroup, for the year → homegroup → students picker. */
export async function getPickerGroups(): Promise<PickerGroup[]> {
  const groups = await db.group.findMany({
    where: { students: { some: { user: { isActive: true } } } },
    select: {
      id: true,
      name: true,
      grade: true,
      students: {
        where: { user: { isActive: true } },
        select: { id: true, studentId: true, user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      },
    },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    grade: g.grade ?? 0,
    students: g.students.map((s) => ({ id: s.id, name: s.user?.name ?? "", studentId: s.studentId })),
  }));
}
