import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import Link from "next/link";
import { Upload, CalendarDays } from "lucide-react";

const DAYS = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ"] as const;
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export default async function TimetablePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ group?: string; teacher?: string; view?: string }>;
}) {
  const [{ locale }, sp, adminAuth] = await Promise.all([
    params,
    searchParams,
    getSuperAdminAuth(),
  ]);

  const isSuperAdmin = !!adminAuth;
  const view = sp.view ?? "group";

  const [groups, teacherNames, slotCount] = await Promise.all([
    db.group.findMany({ orderBy: [{ grade: "asc" }, { name: "asc" }] }),
    db.timetableSlot.findMany({
      where: { staffName: { not: null } },
      select: { staffName: true },
      distinct: ["staffName"],
      orderBy: { staffName: "asc" },
    }),
    db.timetableSlot.count(),
  ]);

  // ── Resolve selected group or teacher ──────────────────────────────────────
  const selectedGroupId = sp.group ?? groups[0]?.id ?? null;
  const selectedTeacher = sp.teacher ?? teacherNames[0]?.staffName ?? null;

  let slots: {
    id: string;
    dayOfWeek: number;
    period: number;
    room: string | null;
    staffName: string | null;
    course: { name: string; nameEl: string };
    group: { name: string } | null;
  }[] = [];

  if (slotCount > 0) {
    if (view === "teacher" && selectedTeacher) {
      slots = await db.timetableSlot.findMany({
        where: { staffName: selectedTeacher },
        include: { course: true, group: true },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      });
    } else if (view === "group" && selectedGroupId) {
      slots = await db.timetableSlot.findMany({
        where: { groupId: selectedGroupId },
        include: { course: true, group: true },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      });
    }
  }

  // Index slots by [day][period]
  const grid: Record<number, Record<number, typeof slots[0] | undefined>> = {};
  for (const s of slots) {
    (grid[s.dayOfWeek] ??= {})[s.period] = s;
  }

  const makeUrl = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, ...(selectedGroupId ? { group: selectedGroupId } : {}), ...(selectedTeacher ? { teacher: selectedTeacher } : {}), ...patch });
    return `/${locale}/admin/timetable?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="text-2xl font-bold text-slate-900">Ωρολόγιο Πρόγραμμα</h2>
        {isSuperAdmin && (
          <Link
            href={`/${locale}/admin/timetable/import`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Εισαγωγή Excel
          </Link>
        )}
      </div>

      {slotCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <CalendarDays className="w-10 h-10 text-slate-300" />
          <p className="text-slate-500 text-sm">Δεν έχει εισαχθεί ακόμη πρόγραμμα.</p>
          {isSuperAdmin && (
            <Link href={`/${locale}/admin/timetable/import`} className="text-sm text-emerald-600 hover:underline">
              Εισαγωγή του Excel προγράμματος →
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* View toggle + selector */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Group / Teacher tabs */}
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              <Link
                href={makeUrl({ view: "group" })}
                className={`px-4 py-1.5 font-medium transition-colors ${view === "group" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                Ανά τμήμα
              </Link>
              <Link
                href={makeUrl({ view: "teacher" })}
                className={`px-4 py-1.5 font-medium transition-colors ${view === "teacher" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                Ανά καθηγητή
              </Link>
            </div>

            {/* Selector */}
            {view === "group" ? (
              <GroupSelector groups={groups} selected={selectedGroupId} locale={locale} view={view} teacher={selectedTeacher} />
            ) : (
              <TeacherSelector teachers={teacherNames.map(t => t.staffName!)} selected={selectedTeacher} locale={locale} view={view} group={selectedGroupId} />
            )}
          </div>

          {/* Grid */}
          {slots.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Δεν υπάρχουν ώρες για αυτή την επιλογή.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="w-12 px-3 py-2.5 text-left text-xs font-semibold text-slate-500 border-b border-slate-200 border-r border-slate-200">P</th>
                    {DAYS.map((d) => (
                      <th key={d} className="px-4 py-2.5 text-center text-xs font-semibold text-slate-600 border-b border-slate-200 border-r border-slate-200 last:border-r-0 min-w-[140px]">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((p) => (
                    <tr key={p} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 text-center text-xs font-mono font-semibold text-slate-400 border-r border-slate-200 bg-slate-50">
                        {p}
                      </td>
                      {DAYS.map((_, di) => {
                        const dayIdx = di + 1;
                        const slot = grid[dayIdx]?.[p];
                        return (
                          <td key={di} className="px-3 py-2 border-r border-slate-100 last:border-r-0 align-top">
                            {slot ? (
                              <div className="space-y-0.5">
                                <p className="font-medium text-slate-900 leading-tight">{slot.course.nameEl}</p>
                                {view === "group"
                                  ? slot.staffName && <p className="text-xs text-slate-500 truncate">{slot.staffName}</p>
                                  : slot.group && <p className="text-xs text-emerald-600 font-mono">{slot.group.name}</p>
                                }
                                {slot.room && <p className="text-xs text-slate-400">Αίθ. {slot.room}</p>}
                              </div>
                            ) : (
                              <span className="text-slate-200 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-slate-400">{slotCount} συνολικές ώρες σε {groups.length} τμήματα</p>
        </>
      )}
    </div>
  );
}

// ── Selector components (server, use <form> + GET for zero-JS navigation) ────

function GroupSelector({
  groups, selected, locale, view, teacher,
}: {
  groups: { id: string; name: string; grade: number }[];
  selected: string | null;
  locale: string;
  view: string;
  teacher: string | null;
}) {
  return (
    <form method="get" action={`/${locale}/admin/timetable`} className="flex items-center gap-2">
      <input type="hidden" name="view" value={view} />
      {teacher && <input type="hidden" name="teacher" value={teacher} />}
      <select
        name="group"
        defaultValue={selected ?? ""}
        onChange={undefined}
        className="h-9 pl-3 pr-8 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} — Τάξη {g.grade === 1 ? "Α΄" : g.grade === 2 ? "Β΄" : g.grade === 3 ? "Γ΄" : g.grade}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
      >
        Μετάβαση
      </button>
    </form>
  );
}

function TeacherSelector({
  teachers, selected, locale, view, group,
}: {
  teachers: string[];
  selected: string | null;
  locale: string;
  view: string;
  group: string | null;
}) {
  return (
    <form method="get" action={`/${locale}/admin/timetable`} className="flex items-center gap-2">
      <input type="hidden" name="view" value={view} />
      {group && <input type="hidden" name="group" value={group} />}
      <select
        name="teacher"
        defaultValue={selected ?? ""}
        className="h-9 pl-3 pr-8 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
      >
        {teachers.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button
        type="submit"
        className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
      >
        Μετάβαση
      </button>
    </form>
  );
}
