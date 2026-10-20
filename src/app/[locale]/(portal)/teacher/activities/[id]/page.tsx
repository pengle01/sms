import { db } from "@/server/db";
import { DateInput } from "@/components/ui/date-input";
import { staffDisplayName } from "@/lib/staffName";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { AddParticipants, RemoveParticipantButton } from "./AddParticipants";
import { getPickerGroups } from "@/server/studentPicker";
import type { PickerGroup } from "@/components/students/StudentPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Users, X, Award, Pencil, Check, Repeat } from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";
import { getPeriodsPerDay, maxPeriodCount } from "@/lib/schoolConfig";
import { ddkCategoryLabel } from "@/lib/ddk";
import {
  removeDdkAward,
  updateActivity,
  repeatActivity,
} from "../actions";
import { ConvertToDdkForm } from "../ConvertToDdkForm";
import { DeleteActivityButton } from "../DeleteActivityButton";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-50 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800 text-right">{value}</dd>
    </div>
  );
}

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ edit?: string; ddk?: string }>;
}) {
  const { locale, id } = await params;
  const { edit, ddk } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const activity = await db.activity.findUnique({
    where: { id },
    include: {
      filer: { include: { user: { select: { name: true } } } },
      participants: {
        include: {
          student: { include: { user: { select: { name: true } }, group: true } },
        },
        orderBy: { student: { user: { name: "asc" } } },
      },
      ddkAwards: {
        include: { student: { include: { user: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!activity) notFound();

  // Only the activity's creator may edit it or convert it to ΔΔΚ.
  const viewer = await db.staffProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const isOwner = !!viewer && viewer.id === activity.filerId;
  const editing = isOwner && edit === "1"; // editing the activity (fields / participants)
  const ddkEditing = isOwner && ddk === "1"; // editing ΔΔΚ awards (removal)

  const dateLabel = fmtDisplayDate(activity.date);
  const dateInput = activity.date.toISOString().slice(0, 10);

  function periodRange(s: number, e: number) {
    return s === e ? `Περίοδος ${s}` : `Περίοδοι ${s}–${e}`;
  }

  // Edit-only data: period options + every active student for the picker.
  let periods: number[] = [];
  let pickerGroups: PickerGroup[] = [];
  if (editing) {
    const periodsConfig = await getPeriodsPerDay();
    periods = Array.from({ length: maxPeriodCount(periodsConfig) }, (_, i) => i + 1);
    pickerGroups = await getPickerGroups();
  }

  const baseHref = `/${locale}/teacher/activities/${id}`;
  // Build a detail-page href, merging overrides onto the current params
  // (null clears a param) — lets the two edit modes coexist independently.
  function buildHref(overrides: Record<string, string | null>) {
    const merged: Record<string, string | undefined | null> = { edit, ddk, ...overrides };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={`/${locale}/teacher/activities`} className="text-slate-500 hover:text-slate-700 mt-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900">{activity.name}</h2>
          <p className="text-slate-500 text-sm mt-1">
            {dateLabel} · {periodRange(activity.startPeriod, activity.endPeriod)}
            {activity.location && ` · ${activity.location}`}
          </p>
          <p className="text-slate-400 text-xs mt-0.5">Διοργάνωση από {staffDisplayName(activity.filer)}</p>
        </div>
        {isOwner &&
          (editing ? (
            <Link
              href={buildHref({ edit: null, grade: null, groupId: null })}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 flex-shrink-0"
            >
              <Check className="w-4 h-4" />
              Τέλος
            </Link>
          ) : (
            <Link
              href={buildHref({ edit: "1" })}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex-shrink-0"
            >
              <Pencil className="w-4 h-4" />
              Επεξεργασία δραστηριότητας
            </Link>
          ))}
      </div>

      {/* Edit details (edit mode only) */}
      {editing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Στοιχεία Δραστηριότητας</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateActivity} className="space-y-4">
              <input type="hidden" name="activityId" value={id} />
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Όνομα δραστηριότητας</label>
                <input
                  name="name"
                  required
                  defaultValue={activity.name}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Ημερομηνία</label>
                <DateInput
                  name="date"
                  required
                  defaultValue={dateInput}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Από περίοδο</label>
                  <select
                    name="startPeriod"
                    defaultValue={String(activity.startPeriod)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {periods.map((p) => (
                      <option key={p} value={p}>Περίοδος {p}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Έως περίοδο</label>
                  <select
                    name="endPeriod"
                    defaultValue={String(activity.endPeriod)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {periods.map((p) => (
                      <option key={p} value={p}>Περίοδος {p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Τοποθεσία <span className="text-slate-400 font-normal">(προαιρετικά)</span>
                </label>
                <input
                  name="location"
                  defaultValue={activity.location ?? ""}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Αποθήκευση
                </button>
                <DeleteActivityButton activityId={id} locale={locale} />
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Full details (view mode) */}
      {!editing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Στοιχεία Δραστηριότητας</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <Field label="Όνομα" value={activity.name} />
              <Field label="Ημερομηνία" value={dateLabel} />
              <Field label="Περίοδοι" value={periodRange(activity.startPeriod, activity.endPeriod)} />
              <Field label="Τοποθεσία" value={activity.location ?? "—"} />
              <Field label="Διοργάνωση" value={staffDisplayName(activity.filer)} />
              <Field label="Συμμετέχοντες" value={String(activity.participants.length)} />
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Participants */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Συμμετέχοντες ({activity.participants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activity.participants.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Δεν έχουν προστεθεί μαθητές ακόμη</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-50">
                {activity.participants.map((p) => (
                  <tr key={p.studentId} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <Link href={`/${locale}/teacher/students/${p.studentId}`} className="hover:underline">
                        {p.student.user?.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-xs">{p.student.group?.name ?? "—"}</Badge>
                    </td>
                    {editing && (
                      <td className="px-5 py-3 text-right">
                        <RemoveParticipantButton activityId={id} studentId={p.studentId} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add students (edit mode only) */}
      {editing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Προσθήκη Μαθητών</CardTitle>
          </CardHeader>
          <CardContent>
            <AddParticipants
              activityId={id}
              groups={pickerGroups}
              participantIds={activity.participants.map((p) => p.studentId)}
            />
          </CardContent>
        </Card>
      )}

      {/* Επανάληψη — turn this activity into a weekly series (edit mode only) */}
      {editing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="w-4 h-4" />
              Επανάληψη
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={repeatActivity} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="activityId" value={id} />
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Εβδομαδιαία επανάληψη έως</label>
                <DateInput
                  name="repeatUntil"
                  min={dateInput}
                  required
                  className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>
              <button
                type="submit"
                className="h-9 px-5 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800"
              >
                Δημιουργία επαναλήψεων
              </button>
            </form>
            <p className="text-xs text-slate-400 mt-2">
              Δημιουργεί αντίγραφα της δραστηριότητας κάθε εβδομάδα την ίδια ημέρα (με τους ίδιους
              συμμετέχοντες), μέχρι την ημερομηνία.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ΔΔΚ — only the activity's creator files/sees it */}
      {isOwner && (
      <Card className="border-amber-200">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            ΔΔΚ — Δημιουργικότητα · Δράση · Κοινωνική Προσφορά
          </CardTitle>
          {activity.ddkAwards.length > 0 &&
            (ddkEditing ? (
              <Link
                href={buildHref({ ddk: null })}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 flex-shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                Τέλος
              </Link>
            ) : (
              <Link
                href={buildHref({ ddk: "1" })}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 flex-shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
                Επεξεργασία ΔΔΚ
              </Link>
            ))}
        </CardHeader>
        <CardContent className="space-y-4">
          {activity.ddkAwards.length > 0 && (
            <ul className="space-y-1.5">
              {activity.ddkAwards.map((aw) => (
                <li
                  key={aw.id}
                  className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2"
                >
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700 text-sm font-bold flex-shrink-0">
                    {aw.points}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{aw.student.user?.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {ddkCategoryLabel(aw.categoryCode)}
                      {aw.note && ` · ${aw.note}`}
                    </p>
                  </div>
                  {ddkEditing && (
                    <form action={removeDdkAward}>
                      <input type="hidden" name="awardId" value={aw.id} />
                      <button
                        type="submit"
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Αφαίρεση"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {activity.participants.length === 0 ? (
            <p className="text-sm text-slate-400">Δεν υπάρχουν συμμετέχοντες για καταχώρηση ΔΔΚ.</p>
          ) : (
            <ConvertToDdkForm
              activityId={id}
              participants={activity.participants.map((p) => ({
                studentId: p.studentId,
                name: p.student.user?.name ?? "—",
                group: p.student.group?.name ?? "—",
              }))}
            />
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
