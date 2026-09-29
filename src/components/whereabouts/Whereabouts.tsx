import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DoorOpen, MapPin, Phone, Search } from "lucide-react";
import { db } from "@/server/db";
import { getRooms } from "@/server/rooms";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import { maxPeriodCount, type PeriodsPerDay } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { SuggestInput } from "@/components/SuggestInput";
import { suggestionList } from "@/lib/textSearch";
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

export interface WhereaboutsParams {
  tab?: string;
  teacher?: string;
  room?: string;
}

/**
 * Where teachers are and which rooms are free, over the regular weekly
 * timetable — for all staff. Today's substitution changes are not overlaid;
 * they live on the substitution plan and each teacher's own schedule.
 *
 * `showPhone` is for secretarial/management/admin (canViewStaffDirectory):
 * the teacher's phone is shown next to their week.
 */
export async function Whereabouts({ params, showPhone }: { params: WhereaboutsParams; showPhone: boolean }) {
  const t = await getTranslations("whereabouts");
  const tab = params.tab === "rooms" ? "rooms" : "teachers";

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

  const tabLink = (key: "teachers" | "rooms") =>
    cn(
      "h-9 px-4 inline-flex items-center gap-2 rounded-xl text-sm font-medium border transition-colors",
      tab === key
        ? "bg-emerald-600 text-white border-emerald-600"
        : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
    );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="w-6 h-6" />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
      </div>

      <div className="flex gap-2">
        <Link href="?tab=teachers" className={tabLink("teachers")}>
          <Search className="w-4 h-4" />
          {t("tabTeachers")}
        </Link>
        <Link href="?tab=rooms" className={tabLink("rooms")}>
          <DoorOpen className="w-4 h-4" />
          {t("tabRooms")}
        </Link>
      </div>

      {tab === "teachers" ? (
        await TeachersTab({ slots, periodsPerDay, query: params.teacher?.trim() ?? "", showPhone })
      ) : (
        await RoomsTab({ slots, periodsPerDay, room: params.room?.trim() ?? "" })
      )}

      <p className="text-xs text-slate-400">{t("regularWeekNote")}</p>
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
  const matches = findTeachers(roster, query);
  const chosen = matches.length === 1 ? matches[0]! : null;
  const week = chosen ? teacherWeek(slots, chosen.scheduleName) : null;

  return (
    <div className="space-y-4">
      <form method="GET" className="flex items-end gap-2">
        <input type="hidden" name="tab" value="teachers" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <SuggestInput
            name="teacher"
            defaultValue={query}
            minChars={2}
            placeholder={t("searchPlaceholder")}
            suggestions={suggestionList(roster.map((r) => r.scheduleName))}
            className="h-9 w-72 max-w-full pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </form>

      {!query ? (
        <p className="text-sm text-slate-500">{t("searchHint")}</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-slate-500">{t("noTeacher", { query })}</p>
      ) : !chosen ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">{t("pickOne", { count: matches.length })}</p>
          <div className="flex flex-wrap gap-2">
            {matches.slice(0, 30).map((m) => (
              <Link
                key={m.scheduleName}
                href={`?tab=teachers&teacher=${encodeURIComponent(m.scheduleName)}`}
                className="h-8 px-3 inline-flex items-center rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
              >
                {m.scheduleName}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className="text-lg font-semibold text-slate-900">{chosen.scheduleName}</h3>
            {chosen.accountName && <span className="text-sm text-slate-500">{chosen.accountName}</span>}
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
