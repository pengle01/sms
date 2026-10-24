import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Phone, Search } from "lucide-react";
import { db } from "@/server/db";
import { getRooms } from "@/server/rooms";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import { maxPeriodCount, type PeriodsPerDay } from "@/lib/periods";
import { cn } from "@/lib/utils";
import {
  WEEK_DAYS,
  cell,
  teacherWeek,
  roomWeek,
  freeRoomsWeek,
  unknownTimetableRooms,
  findTeachers,
  type WeekGrid,
  type WeekSlot,
  type TeacherEntry,
} from "@/lib/whereabouts";
import { RoomSelect } from "./RoomSelect";
import { PrintTimetableLink } from "@/components/timetable/PrintTimetableLink";
import { PrintSpecialtyPicker } from "@/components/timetable/PrintSpecialtyPicker";
import { specialtyGroups } from "@/lib/timetablePrint";
import { filterGroups, parseGroupFilters, type GroupKind } from "@/lib/groupList";
import { groupListAccess, loadGroupDetail, loadGroupIndex } from "@/server/groupList";
import { PrintGroupLink } from "./PrintGroupLink";
import { TeacherPicker } from "./TeacherPicker";
import { WhereaboutsTabs } from "./WhereaboutsTabs";

export interface WhereaboutsParams {
  tab?: string;
  teacher?: string;
  room?: string;
  /** «Τμήματα»: the chosen group's id, and the list's filters. */
  group?: string;
  gq?: string;
  grade?: string;
  kind?: string;
}

/**
 * Where teachers are and which rooms are free, over the regular weekly
 * timetable — for all staff. Today's substitution changes are not overlaid;
 * they live on the substitution plan and each teacher's own schedule.
 *
 * `showPhone` is for secretarial/management/admin (canViewStaffDirectory):
 * the teacher's phone is shown next to their week.
 */
export async function Whereabouts({
  params,
  showPhone,
  basePath,
  studentsHref,
}: {
  params: WhereaboutsParams;
  showPhone: boolean;
  /** This portal's «Πού βρίσκεται;» page. */
  basePath: string;
  /** The live student locator, where this portal has one (teachers). */
  studentsHref?: string;
}) {
  const t = await getTranslations("whereabouts");
  const tab = params.tab === "rooms" ? "rooms" : params.tab === "groups" ? "groups" : "teachers";

  const [rawSlots, periodsPerDay] = await Promise.all([
    db.timetableSlot.findMany({
      select: {
        dayOfWeek: true,
        period: true,
        room: true,
        staffName: true,
        group: { select: { name: true } },
        course: { select: { name: true, nameEl: true } },
      },
    }),
    getPeriodsPerDay(),
  ]);
  const slots: WeekSlot[] = rawSlots.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    period: s.period,
    room: s.room,
    staffName: s.staffName,
    groupName: s.group.name,
    courseName: s.course.nameEl || s.course.name,
  }));

  return (
    <div className="space-y-5">
      <WhereaboutsTabs active={tab} basePath={basePath} studentsHref={studentsHref} />

      {tab === "teachers" ? (
        await TeachersTab({ slots, periodsPerDay, query: params.teacher?.trim() ?? "", showPhone })
      ) : tab === "rooms" ? (
        await RoomsTab({ slots, periodsPerDay, room: params.room?.trim() ?? "" })
      ) : (
        await GroupsTab({ params })
      )}

      <p className="text-xs text-slate-400">{t("regularWeekNote")}</p>
    </div>
  );
}

// ── Groups ──────────────────────────────────────────────────────────────────

/**
 * Every group — homegroups, lesson/elective groups, support groups — as pills,
 * narrowed by year, kind and a name filter; the chosen one shows its students
 * and a printable list. Support groups only for full special-ed access
 * (groupListAccess).
 */
async function GroupsTab({ params }: { params: WhereaboutsParams }) {
  const t = await getTranslations("whereabouts");
  const [canSee, index] = await Promise.all([groupListAccess(), loadGroupIndex()]);
  const groups = canSee ? index.filter((g) => canSee(g.kind)) : [];
  const supportVisible = groups.some((g) => g.kind === "support");

  const filters = parseGroupFilters({ q: params.gq, grade: params.grade, kind: params.kind });
  const shown = filterGroups(groups, filters);
  const chosenId = groups.some((g) => g.id === params.group) ? params.group! : null;
  const detail = chosenId ? await loadGroupDetail(chosenId) : null;

  // Links keep every other choice: filters stay when a group is picked, and the
  // picked group stays while the filters change (if it is still listed).
  const href = (o: { grade?: number | null; kind?: GroupKind | null; group?: string | null }) => {
    const sp = new URLSearchParams({ tab: "groups" });
    const grade = o.grade === undefined ? filters.grade : o.grade;
    const kind = o.kind === undefined ? filters.kind : o.kind;
    const group = o.group === undefined ? chosenId : o.group;
    if (filters.q) sp.set("gq", filters.q);
    if (grade) sp.set("grade", String(grade));
    if (kind) sp.set("kind", kind);
    if (group) sp.set("group", group);
    return `?${sp.toString()}`;
  };
  const pill = (active: boolean) =>
    cn(
      "h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border text-sm transition-colors",
      active
        ? "bg-emerald-600 text-white border-emerald-600"
        : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
    );
  const caption = "text-xs font-semibold text-slate-400 uppercase tracking-wide";
  const kinds: GroupKind[] = supportVisible ? ["homegroup", "lesson", "support"] : ["homegroup", "lesson"];

  const kindBadge = (kind: GroupKind) => (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        kind === "homegroup" && "bg-emerald-50 border-emerald-200 text-emerald-700",
        kind === "lesson" && "bg-sky-50 border-sky-200 text-sky-700",
        kind === "support" && "bg-violet-50 border-violet-200 text-violet-700",
      )}
    >
      {t(`groupKind_${kind}`)}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <p className={caption}>{t("filterGrade")}</p>
          <div className="flex gap-2">
            <Link href={href({ grade: null })} className={pill(filters.grade === null)}>{t("filterAll")}</Link>
            {[1, 2, 3].map((g) => (
              <Link key={g} href={href({ grade: g })} className={pill(filters.grade === g)}>
                {t(`grade_${g}`)}
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className={caption}>{t("filterKind")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={href({ kind: null })} className={pill(filters.kind === null)}>{t("filterAll")}</Link>
            {kinds.map((k) => (
              <Link key={k} href={href({ kind: k })} className={pill(filters.kind === k)}>
                {t(`groupKindPlural_${k}`)}
              </Link>
            ))}
          </div>
        </div>
        <form method="GET" className="space-y-1.5">
          <p className={caption}>{t("filterName")}</p>
          <input type="hidden" name="tab" value="groups" />
          {filters.grade && <input type="hidden" name="grade" value={filters.grade} />}
          {filters.kind && <input type="hidden" name="kind" value={filters.kind} />}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              name="gq"
              defaultValue={filters.q}
              autoComplete="off"
              placeholder={t("groupSearchPlaceholder")}
              className="h-8 w-56 max-w-full pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </form>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-500">{t("noGroupFiltered")}</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">{t("groupsShown", { count: shown.length })}</p>
          <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto">
            {shown.map((g) => (
              <Link key={g.id} href={href({ group: g.id })} className={pill(g.id === chosenId)}>
                {g.name}
                <span className="text-xs opacity-60">{g.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {detail && (
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold text-slate-900">{detail.name}</h3>
            {kindBadge(detail.kind)}
            <span className="text-sm text-slate-500">{t("studentCount", { count: detail.students.length })}</span>
            {detail.students.length > 0 && <PrintGroupLink groupId={detail.id} />}
          </div>
          {detail.lessons.length > 0 && (
            <p className="text-xs text-slate-500">{detail.lessons.join(" · ")}</p>
          )}
          {detail.students.length === 0 ? (
            <p className="text-sm text-slate-400">{t("noStudents")}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 w-10 text-right">#</th>
                    <th className="px-3 py-2 w-28">{t("colRegistry")}</th>
                    <th className="px-3 py-2">{t("colStudent")}</th>
                    {detail.kind !== "homegroup" && <th className="px-3 py-2 w-24">{t("colHomegroup")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.students.map((s, i) => (
                    <tr key={s.id} className={i % 2 === 1 ? "bg-slate-50" : undefined}>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{i + 1}</td>
                      <td className="px-3 py-1.5 tabular-nums text-slate-600">{s.studentId}</td>
                      <td className="px-3 py-1.5 text-slate-900">{s.name}</td>
                      {detail.kind !== "homegroup" && <td className="px-3 py-1.5 text-slate-600">{s.homegroup ?? "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Teachers ────────────────────────────────────────────────────────────────

async function TeachersTab({
  slots,
  periodsPerDay,
  query,
  showPhone,
}: {
  slots: WeekSlot[];
  periodsPerDay: PeriodsPerDay;
  query: string;
  showPhone: boolean;
}) {
  const t = await getTranslations("whereabouts");

  const profiles = await db.staffProfile.findMany({
    // Teachers who left the timetable are not searchable.
    where: { scheduleName: { not: null }, leftTimetableAt: null },
    select: { scheduleName: true, phone: true, user: { select: { name: true } } },
  });
  // The roster: every profile with a timetable name, plus names that appear only
  // in the timetable (a profile is created for every imported name, so this is
  // normally empty — kept so a lesson is never unreachable).
  const byName = new Map<string, TeacherEntry>();
  for (const p of profiles) {
    const name = p.scheduleName!.trim();
    byName.set(name, { scheduleName: name, accountName: p.user?.name ?? null, phone: showPhone ? p.phone : null });
  }
  for (const s of slots) {
    const name = s.staffName?.trim();
    if (name && !byName.has(name)) byName.set(name, { scheduleName: name, accountName: null, phone: null });
  }
  const roster = [...byName.values()];
  // Only names that actually teach can be printed by specialty.
  const specialties = specialtyGroups(slots.flatMap((s) => (s.staffName ? [s.staffName] : []))).map((g) => ({
    code: g.code,
    count: g.names.length,
  }));
  const matches = findTeachers(roster, query);
  const chosen = matches.length === 1 ? matches[0]! : null;
  const week = chosen ? teacherWeek(slots, chosen.scheduleName) : null;

  return (
    <div className="space-y-4">
      <TeacherPicker
        roster={roster.map((r) => ({ scheduleName: r.scheduleName, accountName: r.accountName }))}
        initialQuery={query}
        selected={chosen?.scheduleName ?? null}
        aside={<PrintSpecialtyPicker specialties={specialties} />}
      />

      {chosen && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className="text-lg font-semibold text-slate-900">{chosen.scheduleName}</h3>
            {chosen.accountName && <span className="text-sm text-slate-500">{chosen.accountName}</span>}
            <PrintTimetableLink kind="teacher" value={chosen.scheduleName} />
            {showPhone && (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                <Phone className="w-4 h-4 text-slate-400" />
                {chosen.phone ? (
                  <a href={`tel:${chosen.phone}`} className="text-emerald-700 hover:underline">
                    {chosen.phone}
                  </a>
                ) : (
                  <span className="text-slate-400">{t("noPhone")}</span>
                )}
              </span>
            )}
          </div>
          <WeekTable
            periodsPerDay={periodsPerDay}
            render={(day, period) => {
              const lessons = cell(week!, day, period);
              return lessons.length === 0 ? (
                <span className="text-xs text-slate-300">{t("freePeriod")}</span>
              ) : (
                lessons.map((l, i) => (
                  <div key={i} className="leading-tight">
                    <p className="font-semibold text-slate-800">{l.groupName}</p>
                    <p className="text-xs text-slate-500 truncate">{l.courseName}</p>
                    {l.room && <p className="text-xs font-medium text-emerald-700">{t("roomLabel", { room: l.room })}</p>}
                  </div>
                ))
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Rooms ───────────────────────────────────────────────────────────────────

async function RoomsTab({
  slots,
  periodsPerDay,
  room,
}: {
  slots: WeekSlot[];
  periodsPerDay: PeriodsPerDay;
  room: string;
}) {
  const t = await getTranslations("whereabouts");
  const roomNames = (await getRooms()).map((r) => r.name);
  const unknown = unknownTimetableRooms(roomNames, slots);
  const chosen = roomNames.includes(room) ? room : "";

  const free: WeekGrid<string> = freeRoomsWeek(roomNames, slots, periodsPerDay);
  const occupancy = chosen ? roomWeek(slots, chosen) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <RoomSelect rooms={roomNames} value={chosen} allLabel={t("allRooms")} />
        <p className="text-sm text-slate-500">{chosen ? t("roomWeekHint", { room: chosen }) : t("freeRoomsHint")}</p>
        {chosen && <PrintTimetableLink kind="room" value={chosen} />}
      </div>

      {occupancy ? (
        <WeekTable
          periodsPerDay={periodsPerDay}
          render={(day, period) => {
            const lessons = cell(occupancy, day, period);
            return lessons.length === 0 ? (
              <span className="text-xs font-medium text-emerald-600">{t("roomFree")}</span>
            ) : (
              lessons.map((l, i) => (
                <div key={i} className="leading-tight">
                  <p className="font-semibold text-slate-800">{l.groupName}</p>
                  <p className="text-xs text-slate-500 truncate">{l.courseName}</p>
                  <p className="text-xs text-slate-600">{l.staffName ?? "—"}</p>
                </div>
              ))
            );
          }}
        />
      ) : (
        <WeekTable
          periodsPerDay={periodsPerDay}
          render={(day, period) => {
            const rooms = cell(free, day, period);
            return (
              <div className="leading-tight">
                <p className={cn("text-xs font-semibold", rooms.length ? "text-emerald-700" : "text-slate-400")}>
                  {t("freeCount", { count: rooms.length })}
                </p>
                {rooms.length > 0 && <p className="text-xs text-slate-600 mt-0.5 break-words">{rooms.join(", ")}</p>}
              </div>
            );
          }}
        />
      )}

      {unknown.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t("unknownRooms", { rooms: unknown.join(", ") })}
        </p>
      )}
    </div>
  );
}

// ── Grid ────────────────────────────────────────────────────────────────────

async function WeekTable({
  periodsPerDay,
  render,
}: {
  periodsPerDay: PeriodsPerDay;
  render: (day: number, period: number) => React.ReactNode;
}) {
  const tc = await getTranslations("common");
  const periods = Array.from({ length: maxPeriodCount(periodsPerDay) }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-sm border-collapse table-fixed">
        <thead>
          <tr>
            <th className="w-12 border-b border-slate-100 px-2 py-2" />
            {WEEK_DAYS.map((d) => (
              <th
                key={d}
                className="border-b border-l border-slate-100 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {tc(`dowShort${d}` as "dowShort1")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}>
              <td className="border-t border-slate-100 px-2 py-2 text-xs font-semibold text-slate-400 align-top">
                {tc("periodShort", { period: p })}
              </td>
              {WEEK_DAYS.map((d) => {
                const noSchool = p > (periodsPerDay[d] ?? 7);
                return (
                  <td
                    key={d}
                    className={cn(
                      "border-t border-l border-slate-100 px-2 py-2 align-top",
                      noSchool && "bg-slate-50",
                    )}
                  >
                    {noSchool ? null : render(d, p)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
