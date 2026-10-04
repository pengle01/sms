import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { utcMidnight, toAppTimeline, fromAppTimeline } from "@/lib/dates";
import { toCsv } from "@/lib/attendanceReport";
import { markerDetails, MARKER_INCLUDE } from "@/server/attendanceReport";
import { getTranslations } from "next-intl/server";

// Downloads one day's absence log as CSV (or Excel with ?format=xlsx) and
// records the download, so the
// office always knows which days were already taken and whether rows were
// added afterwards.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  // Explicit locale rather than the request-scoped one: a route handler has no
  // rendered page to infer it from, and the segment already carries it.
  const t = await getTranslations({ locale, namespace: "officeAttendance" });
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const dateStr = sp.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new NextResponse("Bad date", { status: 400 });
  }
  const groupId = sp.get("groupId") || null;
  const date = utcMidnight(dateStr);

  // The file contains what was FILED on this day (matching the log page);
  // retroactive rows carry the attendance date they refer to.
  const filingDay = (d: Date) => toAppTimeline(d).toLocaleDateString("en-CA", { timeZone: "Asia/Nicosia" });
  const rowsRaw = await db.attendance.findMany({
    where: {
      createdAt: {
        gte: new Date(fromAppTimeline(date).getTime() - 24 * 60 * 60 * 1000),
        lt: new Date(fromAppTimeline(date).getTime() + 48 * 60 * 60 * 1000),
      },
      OR: [{ status: "ABSENT" }, { status: "LATE" }, { isAutoAbsent: true }],
      ...(groupId ? { student: { groupId } } : {}),
    },
    include: {
      student: { include: { user: { select: { name: true } }, group: { select: { name: true } } } },
      ...MARKER_INCLUDE,
      exitPermit: { select: { reason: true } },
    },
    orderBy: [{ date: "asc" }, { student: { user: { name: "asc" } } }, { timetableSlot: { period: "asc" } }],
  });
  const rows = rowsRaw.filter((a) => filingDay(a.createdAt) === dateStr);

  const markers = await markerDetails(rows);
  const KIND_LABEL = {
    COVER: t("subTeacher"),
    SWAP: t("subTeacher"),
    STUDY_HALL: t("subHeadteacher"),
    CLAIM: t("subClaim"),
    HOMEGROUP_COVER: t("subHomegroup"),
  } as const;
  const lessonText = (id: string) => {
    const m = markers.get(id);
    if (!m) return "";
    return m.lesson === "lesson" ? m.courseName ?? "" : m.lesson === "excursion" ? t("lessonExcursion") : t("lessonHomegroupPeriod");
  };
  const markerText = (id: string) => {
    const m = markers.get(id);
    return m ? `${m.marker}${m.tag ? ` ${t(`tag.${m.tag}`)}` : ""}` : "";
  };

  const header = [
      t("csvFiledOn"), t("csvAbsenceDate"), t("csvOtherDay"), t("csvStudentId"), t("colStudent"),
      t("colGroup"), t("colPeriod"), t("colCourse"), t("colStatus"), t("csvAuto"),
      t("csvDelayMinutes"), t("exitPermit"), t("colTeacher"), t("csvSubstitution"), t("csvLessonTeacher"), t("waived"),
      t("csvSms"),
  ];
  const table = rows.map((a) => [
      dateStr,
      a.date.toISOString().slice(0, 10),
      a.date.toISOString().slice(0, 10) !== dateStr ? t("csvYes") : "",
      a.student.studentId,
      a.student.user?.name ?? "",
      a.student.group?.name ?? "",
      a.timetableSlot?.period ?? a.intercalaryPeriod ?? "",
      lessonText(a.id),
      a.status === "ABSENT" ? t("absent") : a.status === "LATE" ? t("late") : a.status,
      a.isAutoAbsent ? t("csvYes") : "",
      a.minutesDelayed > 0 ? a.minutesDelayed : "",
      a.exitPermit ? a.exitPermit.reason : "",
      markerText(a.id),
      (() => { const k = markers.get(a.id)?.kind; return k ? KIND_LABEL[k] : ""; })(),
      markers.get(a.id)?.lessonTeacher ?? "",
      a.waived ? t("csvYes") : "",
      a.smsSent ? t("csvYes") : "",
  ]);

  // The download record: which day, by whom, how many rows the file held
  await db.attendanceExport.create({
    data: { date, groupId, userId: session.user.id, records: rows.length },
  });

  if (sp.get("format") === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet([header, ...table]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, dateStr);
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="absences_${dateStr}.xlsx"`,
      },
    });
  }

  return new NextResponse(toCsv(header, table), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="absences_${dateStr}.csv"`,
    },
  });
}
