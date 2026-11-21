import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, PenLine } from "lucide-react";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { dutyDowFor } from "@/lib/dutyRoster";
import { testPeriods } from "@/lib/transcribers";
import { TranscriptionForm } from "./TranscriptionForm";
import type { TranscriptionMark } from "./actions";

// The transcriber's register for the one student they sit a test with. That
// student is left off the class register for the test's period(s).
export default async function TranscriptionAttendancePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } });

  const row = await db.testTranscriber.findUnique({
    where: { id },
    select: {
      staffId: true,
      room: true,
      studentId: true,
      student: { select: { user: { select: { name: true } }, group: { select: { name: true } } } },
      test: {
        select: {
          groupId: true,
          date: true,
          period: true,
          periodCount: true,
          course: { select: { name: true } },
          group: { select: { name: true } },
          staff: { select: { scheduleName: true, user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!row || !staff || row.staffId !== staff.id) notFound();

  const t = await getTranslations("transcription");
  const { test } = row;
  const periods = testPeriods(test.period, test.periodCount);
  const dow = dutyDowFor(test.date);
  const existing = dow
    ? await db.attendance.findMany({
        where: {
          studentId: row.studentId,
          date: test.date,
          timetableSlot: { groupId: test.groupId, dayOfWeek: dow, period: { in: periods } },
        },
        select: { status: true, minutesDelayed: true, timetableSlot: { select: { period: true } } },
      })
    : [];
  const initial: TranscriptionMark[] = periods.map((period) => {
    const e = existing.find((x) => x.timetableSlot?.period === period);
    return {
      period,
      status: e ? (e.status === "EXCUSED" ? "ABSENT" : e.status) : "PRESENT",
      minutesDelayed: e?.minutesDelayed ?? 0,
    };
  });
  const backHref = `/${locale}/teacher/dashboard`;
  const isFuture = test.date > utcMidnight();

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-3">
          <ArrowLeft className="w-4 h-4" />
          {t("back")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <PenLine className="w-6 h-6 text-sky-600" />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {fmtDisplayDate(test.date)} · {test.course.name} · {test.group.name} ·{" "}
          {test.staff.user?.name ?? test.staff.scheduleName ?? ""}
          {row.room ? ` · ${t("room", { room: row.room })}` : ""}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-base font-semibold text-slate-900">{row.student.user?.name}</p>
        {row.student.group && <p className="text-sm text-slate-500">{row.student.group.name}</p>}
      </div>

      {isFuture ? (
        <p className="text-sm text-slate-400">{t("notYet")}</p>
      ) : (
        <TranscriptionForm id={id} backHref={backHref} initial={initial} />
      )}
    </div>
  );
}
