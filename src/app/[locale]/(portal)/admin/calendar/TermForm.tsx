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
import { createTerm, updateTerm, deleteTerm } from "./actions";
import { localDateStr } from "@/lib/dates";
import type { SchoolTerm } from "@/generated/prisma";

interface Props {
  term?: SchoolTerm;
  open: boolean;
  onClose: () => void;
}

export function TermForm({ term, open, onClose }: Props) {
  const t = useTranslations("calendar");
  const tCommon = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const fmt = (d: Date) => localDateStr(new Date(d));

  const PRESETS = ["Α΄ Τετράμηνο", "Β΄ Τετράμηνο"] as const;

  const [label, setLabel] = useState(term?.label ?? "");
  const [startDate, setStartDate] = useState(term ? fmt(term.startDate) : "");
  const [endDate, setEndDate] = useState(term ? fmt(term.endDate) : "");
  const [deadline, setDeadline] = useState(term ? fmt(term.testDeadline) : "");

  function reset() {
    setLabel(term?.label ?? "");
    setStartDate(term ? fmt(term.startDate) : "");
    setEndDate(term ? fmt(term.endDate) : "");
    setDeadline(term ? fmt(term.testDeadline) : "");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      if (term) {
        await updateTerm(term.id, { label, startDate, endDate, testDeadline: deadline });
      } else {
        await createTerm({ label, startDate, endDate, testDeadline: deadline });
      }
      handleClose();
    });
  }

  function handleDelete() {
    if (!term) return;
    startTransition(async () => {
      await deleteTerm(term.id);
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{term ? t("editTerm") : t("addTerm")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!term && (
            <div className="flex gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLabel(preset)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    label === preset
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("termLabel")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("termStart")}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t("termEnd")}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("termDeadline")}</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
          </div>
          <DialogFooter className="gap-2 pt-2">
            {term && (
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
            <Button type="submit" size="sm" disabled={isPending || !label || !startDate || !endDate || !deadline}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
