"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange, Plus, Pencil, BookOpen } from "lucide-react";
import { TermForm } from "./TermForm";
import { SpecialDayForm } from "./SpecialDayForm";
import { localDateStr, fmtDisplayDate } from "@/lib/dates";
import type { SchoolTerm, SpecialDay, SpecialDayType } from "@/generated/prisma";

const TYPE_COLORS: Record<SpecialDayType, string> = {
  INTERCALARY: "bg-purple-100 text-purple-700",
  EXCURSION: "bg-blue-100 text-blue-700",
  BANK_HOLIDAY: "bg-red-100 text-red-700",
  CHRISTMAS: "bg-emerald-100 text-emerald-700",
  EASTER: "bg-yellow-100 text-yellow-700",
  OTHER_HOLIDAY: "bg-slate-100 text-slate-700",
};

function fmtDate(d: Date) {
  return fmtDisplayDate(d);
}

interface Props {
  terms: SchoolTerm[];
  specialDays: SpecialDay[];
}

export function CalendarClient({ terms, specialDays }: Props) {
  const t = useTranslations("calendar");

  const [termOpen, setTermOpen] = useState(false);
  const [editTerm, setEditTerm] = useState<SchoolTerm | undefined>(undefined);

  const [dayOpen, setDayOpen] = useState(false);
  const [editDay, setEditDay] = useState<SpecialDay | undefined>(undefined);

  return (
    <div className="space-y-6">
      {/* School Terms */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            {t("terms")}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => { setEditTerm(undefined); setTermOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t("addTerm")}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {terms.length === 0 ? (
            <p className="px-5 py-8 text-center text-slate-400 text-sm">{t("noTerms")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("termLabel")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("termStart")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("termEnd")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("termDeadline")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {terms.map((term) => (
                  <tr key={term.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{term.label}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(term.startDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(term.endDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(term.testDeadline)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditTerm(term); setTermOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Special Days */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="w-4 h-4" />
            {t("specialDays")}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => { setEditDay(undefined); setDayOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t("addSpecialDay")}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {specialDays.length === 0 ? (
            <p className="px-5 py-8 text-center text-slate-400 text-sm">{t("noSpecialDays")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("dayType")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("dayLabel")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("dayStart")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("dayEnd")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {specialDays.map((day) => (
                  <tr key={day.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Badge className={`${TYPE_COLORS[day.type]} border-0 text-xs`}>
                        {t(`types.${day.type}` as Parameters<typeof t>[0])}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {day.label ?? "—"}
                      {day.type === "INTERCALARY" && day.intercalaryMeetingPeriod != null && (
                        <span className="ml-2 text-xs text-purple-500 font-medium">P{day.intercalaryMeetingPeriod}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(day.startDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(day.endDate)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditDay(day); setDayOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <TermForm open={termOpen} term={editTerm} onClose={() => setTermOpen(false)} />
      <SpecialDayForm open={dayOpen} day={editDay} onClose={() => setDayOpen(false)} />
    </div>
  );
}
