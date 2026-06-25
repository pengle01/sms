import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { DUTY_ELIGIBLE_ROLES } from "@/lib/dutyRoster";
import { staffDisplayName } from "@/lib/staffName";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY, getMaxTestsPerWeek, DEFAULT_MAX_TESTS_PER_WEEK, getSchoolYear, getTermDatesConfig, getSchoolName, getGradesUnlocked, getAttendanceLockConfig } from "@/lib/schoolConfig";
import { getSmsConfig } from "@/lib/sms";
import { getEmailConfig } from "@/lib/email";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const { PeriodsForm } = await import("./PeriodsForm");
  const { MaxTestsForm } = await import("./MaxTestsForm");
  const { SmsSettingsForm } = await import("./SmsSettingsForm");
  const { EmailSettingsForm } = await import("./EmailSettingsForm");
  const { TermDatesForm } = await import("./TermDatesForm");
  const { SchoolNameForm } = await import("./SchoolNameForm");
  const { DutyRosterForm } = await import("./DutyRosterForm");
  const { GradesUnlockForm } = await import("./GradesUnlockForm");
  const { AttendanceLockForm } = await import("./AttendanceLockForm");
  const [periodsPerDay, maxTestsPerWeek, smsConfig, emailConfig, termConfig, schoolYear, schoolName, gradesUnlocked, attendanceLock, dutyEntries, dutyDeputies] = await Promise.all([
    getPeriodsPerDay(),
    getMaxTestsPerWeek(),
    getSmsConfig(),
    getEmailConfig(),
    getTermDatesConfig(),
    getSchoolYear(),
    getSchoolName(),
    getGradesUnlocked(),
    getAttendanceLockConfig(),
    db.dutyRosterEntry.findMany({ select: { dayOfWeek: true, staffProfileId: true } }),
    db.staffProfile.findMany({
      where: { user: { is: { role: { in: DUTY_ELIGIBLE_ROLES }, isActive: true } } },
      select: { id: true, scheduleName: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  const initial = { ...DEFAULT_PERIODS_PER_DAY, ...periodsPerDay };
  const maxTestsInitial = maxTestsPerWeek ?? DEFAULT_MAX_TESTS_PER_WEEK;

  // Form shows the stored config; resolved defaults fill the term boundaries.
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dayBefore = (d: Date) => iso(new Date(d.getTime() - 86_400_000)); // exclusive → inclusive
  const termInitial = {
    term1Start: termConfig?.term1Start ?? iso(schoolYear.yearStart),
    term1End: termConfig?.term1End ?? dayBefore(schoolYear.term1End),
    testDeadline1: termConfig?.testDeadline1 ?? "",
    term2Start: termConfig?.term2Start ?? iso(schoolYear.term2Start),
    term2End: termConfig?.term2End ?? dayBefore(schoolYear.yearEnd),
    testDeadline2: termConfig?.testDeadline2 ?? "",
    christmasStart: termConfig?.christmasStart ?? "",
    christmasEnd: termConfig?.christmasEnd ?? "",
    easterStart: termConfig?.easterStart ?? "",
    easterEnd: termConfig?.easterEnd ?? "",
  };

  // Weekly on-duty schedule: weekday → assigned staffProfileIds
  const dutyInitial: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const e of dutyEntries) dutyInitial[e.dayOfWeek]?.push(e.staffProfileId);
  const deputyOptions = dutyDeputies.map((d) => ({
    staffProfileId: d.id,
    name: staffDisplayName(d, d.id),
  }));

  // Email: prefill Resend defaults (temporary, until M365 SMTP is enabled) + the
  // school name as the formal "From name".
  const emailInitial = {
    host: emailConfig.host || "smtp.resend.com",
    port: emailConfig.port || "587",
    user: emailConfig.user || "resend",
    pass: emailConfig.pass,
    from: emailConfig.from,
    fromName: emailConfig.fromName || (schoolName ?? ""),
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-500 text-sm mt-1">School-wide configuration</p>
      </div>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">School Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <SchoolNameForm initial={schoolName ?? ""} />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">School Year & Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <TermDatesForm initial={termInitial} />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Εφημερεύοντες Βοηθοί (On-Duty Deputies)</CardTitle>
        </CardHeader>
        <CardContent>
          <DutyRosterForm initial={dutyInitial} deputies={deputyOptions} />
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Grade Entry (Βαθμολογία)</CardTitle>
        </CardHeader>
        <CardContent>
          <GradesUnlockForm initial={gradesUnlocked} />
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Attendance Lock</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceLockForm initial={attendanceLock} />
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Periods per Day</CardTitle>
        </CardHeader>
        <CardContent>
          <PeriodsForm initial={initial} />
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Test Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <MaxTestsForm initial={maxTestsInitial} />
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">SMS Gateway (WebSMS / Cytacom)</CardTitle>
        </CardHeader>
        <CardContent>
          <SmsSettingsForm initial={smsConfig} />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Email (SMTP)</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailSettingsForm initial={emailInitial} />
        </CardContent>
      </Card>
    </div>
  );
}
