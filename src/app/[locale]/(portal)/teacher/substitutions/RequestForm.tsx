"use client";

import { useState, useTransition } from "react";
import { DateInput } from "@/components/ui/date-input";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createSubstitutionRequest } from "./actions";
import type { Room } from "@/lib/rooms";

type RequestType = "ABSENCE" | "EXEMPTION" | "ROOM_CHANGE";
type Duration = "DAY" | "RANGE" | "PERIODS";

const REASONS = [
  "Ασθένεια",
  "Στρατός",
  "Ασθένεια Παιδιού",
  "Σεμινάριο",
  "Αθλητικοί Αγώνες",
  "Erasmus",
  "Εκπαιδευτική Εκδρομή",
  "Άλλο",
] as const;

interface Props {
  groups: { id: string; name: string }[];
  maxPeriod: number;
  rooms: Room[];
}

export function RequestForm({ groups, maxPeriod, rooms }: Props) {
  const t = useTranslations("substitutions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<RequestType>("ABSENCE");
  const [duration, setDuration] = useState<Duration>("DAY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [periods, setPeriods] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [reasonDetails, setReasonDetails] = useState("");
  const [groupId, setGroupId] = useState("");
  const [period, setPeriod] = useState(1);
  const [newRoom, setNewRoom] = useState("");

  const allPeriods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

  const togglePeriod = (p: number) =>
    setPeriods((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p].sort((a, b) => a - b)));

  const reset = () => {
    setStartDate(""); setEndDate(""); setPeriods([]); setReason("");
    setReasonDetails(""); setGroupId(""); setNewRoom("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) { toast.error(t("errDate")); return; }
    if (type === "ABSENCE") {
      if (!reason) { toast.error(t("errReason")); return; }
      if (reason === "Άλλο" && !reasonDetails.trim()) { toast.error(t("errOtherReason")); return; }
      if (duration === "RANGE" && !endDate) { toast.error(t("errRange")); return; }
      if (duration === "PERIODS" && periods.length === 0) { toast.error(t("errPeriods")); return; }
    }
    if (type === "ROOM_CHANGE" && (!groupId || !newRoom.trim())) {
      toast.error(t("errRoomChange"));
      return;
    }

    startTransition(async () => {
      const res = await createSubstitutionRequest({
        type,
        startDate,
        endDate: type === "ABSENCE" && duration === "RANGE" ? endDate : null,
        periods:
          type === "ABSENCE" && duration === "PERIODS"
            ? periods
            : type === "ROOM_CHANGE"
              ? [period]
              : [],
        reason: type === "ABSENCE" ? reason : reasonDetails.trim() || null,
        reasonDetails: type === "ABSENCE" ? reasonDetails.trim() || null : null,
        groupId: type === "ROOM_CHANGE" ? groupId : null,
        newRoom: type === "ROOM_CHANGE" ? newRoom : null,
      });
      if (res.ok) {
        toast.success(t("submitted"));
        reset();
        router.refresh();
      } else {
        toast.error(t(res.error as Parameters<typeof t>[0]));
      }
    });
  };

  const radio = (checked: boolean) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors text-sm font-medium ${
      checked ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
    }`;

  const input =
    "w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Request type */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">{t("requestType")}</p>
        {(
          [
            ["ABSENCE", t("typeAbsence")],
            ["EXEMPTION", t("typeExemption")],
            ["ROOM_CHANGE", t("typeRoomChange")],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={radio(type === value)}>
            <input
              type="radio"
              name="type"
              className="sr-only"
              checked={type === value}
              onChange={() => setType(value)}
            />
            {label}
          </label>
        ))}
      </div>

      {/* ABSENCE: duration */}
      {type === "ABSENCE" && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">{t("duration")}</p>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                ["DAY", t("durationDay")],
                ["RANGE", t("durationRange")],
                ["PERIODS", t("durationPeriods")],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                  duration === value
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-emerald-400"
                }`}
              >
                <input
                  type="radio"
                  name="duration"
                  className="sr-only"
                  checked={duration === value}
                  onChange={() => setDuration(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">
            {type === "ABSENCE" && duration === "RANGE" ? t("firstDay") : t("date")}
          </label>
          <DateInput value={startDate} onChange={setStartDate} className={input} required />
        </div>
        {type === "ABSENCE" && duration === "RANGE" && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">{t("lastDay")}</label>
            <DateInput value={endDate} onChange={setEndDate} className={input} />
          </div>
        )}
      </div>

      {/* ABSENCE: specific periods */}
      {type === "ABSENCE" && duration === "PERIODS" && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700">{t("periods")}</p>
          <div className="flex gap-1.5 flex-wrap">
            {allPeriods.map((p) => (
              <label
                key={p}
                className={`w-9 h-9 flex items-center justify-center rounded-lg border text-sm font-semibold cursor-pointer ${
                  periods.includes(p)
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-emerald-400"
                }`}
              >
                <input type="checkbox" className="sr-only" checked={periods.includes(p)} onChange={() => togglePeriod(p)} />
                {p}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ABSENCE: reason */}
      {type === "ABSENCE" && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">{t("reason")}</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={input} required>
            <option value="">{t("pickReason")}</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {reason === "Άλλο" && (
            <input
              value={reasonDetails}
              onChange={(e) => setReasonDetails(e.target.value)}
              placeholder={t("otherReason")}
              className={`${input} mt-1.5`}
            />
          )}
        </div>
      )}

      {/* EXEMPTION: optional note */}
      {type === "EXEMPTION" && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">{t("exemptionReason")}</label>
          <input value={reasonDetails} onChange={(e) => setReasonDetails(e.target.value)} className={input} />
        </div>
      )}

      {/* ROOM_CHANGE fields */}
      {type === "ROOM_CHANGE" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">{t("period")}</label>
            <select value={period} onChange={(e) => setPeriod(parseInt(e.target.value))} className={input}>
              {allPeriods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">{t("group")}</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={input} required>
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">{t("newRoom")}</label>
            <select value={newRoom} onChange={(e) => setNewRoom(e.target.value)} className={input} required>
              <option value="">—</option>
              {rooms.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} · {t("roomSeats", { count: r.capacity })}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("submit")}
      </button>
    </form>
  );
}
