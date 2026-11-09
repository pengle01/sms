import { getTranslations } from "next-intl/server";
import { teacherWithSpecialty } from "@/lib/staffName";
import type { VisitListRow } from "@/lib/visitHours";

type Hour = VisitListRow["hours"][number];

/** «Τρίτη, 3η, 9:30–10:15», «Με ραντεβού», or the sheet's own words. */
export async function visitHourText(h: Hour): Promise<string> {
  const t = await getTranslations("visitHours");
  if (h.byAppointment) return t("byAppointment");
  if (h.dayOfWeek == null) return h.slotText;
  return t("slot", { day: t(`day_${h.dayOfWeek}`), period: h.period ?? 0, from: h.startTime ?? "", to: h.endTime ?? "" });
}

/** The teachers of a homegroup or a child, with their visit hours. */
export async function VisitList({ rows }: { rows: VisitListRow[] }) {
  const t = await getTranslations("visitHours");
  if (rows.length === 0) return <p className="text-sm text-slate-400">{t("noTeachers")}</p>;
  const hourTexts = await Promise.all(rows.map((r) => Promise.all(r.hours.map(visitHourText))));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
            <th className="py-2 pr-3">{t("colTeacher")}</th>
            <th className="py-2 pr-3">{t("colLessons")}</th>
            <th className="py-2">{t("colHour")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.staffProfileId ?? r.name} className="align-top">
              <td className="py-2 pr-3 font-medium text-slate-900">{teacherWithSpecialty(r.name, r.department)}</td>
              <td className="py-2 pr-3 text-slate-600">
                {r.roles.map((role) => (
                  <span key={role} className="block text-xs font-medium text-emerald-700">{t(`role_${role}`)}</span>
                ))}
                {r.lessons.map((l) => (
                  <span key={`${l.course}|${l.group}`} className="block">
                    {l.course}
                    {l.group && <span className="text-slate-400"> · {l.group}</span>}
                  </span>
                ))}
              </td>
              <td className="py-2 text-slate-700">
                {r.hours.length === 0 ? (
                  <span className="text-slate-500">{t("notSet")}</span>
                ) : (
                  r.hours.map((h, j) => (
                    <span key={j} className="block">
                      {hourTexts[i]![j]}
                      {h.phone && <span className="text-slate-500"> · {t("phone", { phone: h.phone })}</span>}
                    </span>
                  ))
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
