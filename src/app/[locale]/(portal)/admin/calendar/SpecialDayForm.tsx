"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSpecialDay, updateSpecialDay, deleteSpecialDay } from "./actions";
import { localDateStr } from "@/lib/dates";
import type { SpecialDay, SpecialDayType } from "@/generated/prisma";

const SPECIAL_DAY_TYPES: SpecialDayType[] = [
  "INTERCALARY",
  "EXCURSION",
  "BANK_HOLIDAY",
  "CHRISTMAS",
  "EASTER",
  "OTHER_HOLIDAY",
  "SCHOOL_EVENT",
];

const RANGE_TYPES: SpecialDayType[] = ["CHRISTMAS", "EASTER"];

interface Props {
  day?: SpecialDay;
  open: boolean;
  onClose: () => void;
}

export function SpecialDayForm({ day, open, onClose }: Props) {
  const t = useTranslations("calendar");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const fmt = (d: Date) => localDateStr(new Date(d));

  const [type, setType] = useState<SpecialDayType>(day?.type ?? "BANK_HOLIDAY");
  const [startDate, setStartDate] = useState(day ? fmt(day.startDate) : "");
  const [endDate, setEndDate] = useState(day ? fmt(day.endDate) : "");
  const [label, setLabel] = useState(day?.label ?? "");
  const [meetingPeriod, setMeetingPeriod] = useState(day?.intercalaryMeetingPeriod ?? 8);
  const [eventStartPeriod, setEventStartPeriod] = useState(day?.eventStartPeriod ?? 1);
  const [eventEndPeriod, setEventEndPeriod] = useState(day?.eventEndPeriod ?? 1);
  const isRange = RANGE_TYPES.includes(type);

  function reset() {
    setType(day?.type ?? "BANK_HOLIDAY");
    setStartDate(day ? fmt(day.startDate) : "");
    setEndDate(day ? fmt(day.endDate) : "");
    setLabel(day?.label ?? "");
    setMeetingPeriod(day?.intercalaryMeetingPeriod ?? 8);
    setEventStartPeriod(day?.eventStartPeriod ?? 1);
    setEventEndPeriod(day?.eventEndPeriod ?? 1);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const effectiveEnd = isRange ? endDate : startDate;
    startTransition(async () => {
      if (day) {
        await updateSpecialDay(day.id, { type, startDate, endDate: effectiveEnd, label: label || undefined, intercalaryMeetingPeriod: meetingPeriod, eventStartPeriod, eventEndPeriod });
      } else {
        await createSpecialDay({ type, startDate, endDate: effectiveEnd, label: label || undefined, intercalaryMeetingPeriod: meetingPeriod, eventStartPeriod, eventEndPeriod });
      }
      handleClose();
    });
  }

  function handleDelete() {
    if (!day) return;
    startTransition(async () => {
      await deleteSpecialDay(day.id);
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{day ? t("editSpecialDay") : t("addSpecialDay")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("dayType")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as SpecialDayType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPECIAL_DAY_TYPES.map((dt) => (
                  <SelectItem key={dt} value={dt}>
                    {t(`types.${dt}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isRange ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("dayStart")}</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>{t("dayEnd")}</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("dayStart")}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
          )}
          {type === "INTERCALARY" && (
            <div className="space-y-1.5">
              <Label>{t("meetingPeriod")}</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={meetingPeriod}
                onChange={(e) => setMeetingPeriod(Math.max(1, Math.min(8, parseInt(e.target.value) || 8)))}
                required
              />
            </div>
          )}
          {type === "SCHOOL_EVENT" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("eventStartPeriod")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={eventStartPeriod}
                  onChange={(e) => setEventStartPeriod(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("eventEndPeriod")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={eventEndPeriod}
                  onChange={(e) => setEventEndPeriod(Math.max(1, Math.min(8, parseInt(e.target.value) || 1)))}
                  required
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("dayLabel")} <span className="text-slate-400 text-xs">(optional)</span></Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t(`types.${type}` as Parameters<typeof t>[0])} />
          </div>
          <DialogFooter className="gap-2 pt-2">
            {day && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
              >
                {tCommon("delete")}
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={isPending || !startDate || (isRange && !endDate)}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
