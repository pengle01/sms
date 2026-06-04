import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY, getMaxTestsPerWeek, DEFAULT_MAX_TESTS_PER_WEEK, getSchoolYear, getTermDatesConfig, getSchoolName } from "@/lib/schoolConfig";
import { getSmsConfig } from "@/lib/sms";

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
  const { TermDatesForm } = await import("./TermDatesForm");
  const { SchoolNameForm } = await import("./SchoolNameForm");
  const [periodsPerDay, maxTestsPerWeek, smsConfig, termConfig, schoolYear, schoolName] = await Promise.all([
    getPeriodsPerDay(),
    getMaxTestsPerWeek(),
    getSmsConfig(),
    getTermDatesConfig(),
    getSchoolYear(),
    getSchoolName(),
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
    </div>
  );
}
