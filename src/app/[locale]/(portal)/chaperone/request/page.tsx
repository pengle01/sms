import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { submitChaperoneRequestAction } from "./actions";

export default async function ChaperoneRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "CHAPERONE") redirect(`/${locale}/login`);

  const students = await db.studentProfile.findMany({
    where: { user: { isActive: true } },
    include: {
      user: { select: { name: true } },
      group: { select: { name: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Request Students</h2>
        <p className="text-slate-500 mt-1">
          Select the students you will be accompanying. An administrator will review and approve your request.
        </p>
      </div>

      {error === "noStudents" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Please select at least one student.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-700">Optional note (trip description, date, etc.)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <form action={submitChaperoneRequestAction} className="space-y-6">
            <input type="hidden" name="locale" value={locale} />

            <Textarea
              name="note"
              placeholder="e.g. Science museum trip on 15 June — Grade A1 students"
              className="resize-none"
              rows={2}
            />

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Select students ({students.length} total)
              </Label>
              <div className="border rounded-lg max-h-96 overflow-y-auto divide-y divide-slate-100">
                {students.map((sp) => (
                  <label
                    key={sp.id}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 has-[:checked]:bg-emerald-50"
                  >
                    <input
                      type="checkbox"
                      name="studentId"
                      value={sp.id}
                      className="accent-emerald-600 w-4 h-4 flex-shrink-0"
                    />
                    <span className="flex-1 text-sm text-slate-800">{sp.user.name ?? "—"}</span>
                    {sp.group && (
                      <span className="text-xs text-slate-400 font-mono">{sp.group.name}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              Submit request for approval
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
