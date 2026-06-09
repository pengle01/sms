import { db } from "@/server/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AccessCodeCard } from "@/components/access/AccessCodeCard";
import { SmsRecipientsCard } from "@/components/students/SmsRecipientsCard";

export default async function OfficeStudentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const student = await db.studentProfile.findUnique({
    where: { id },
    include: {
      user: { select: { name: true } },
      group: { select: { name: true } },
      smsContacts: { orderBy: [{ isDefault: "desc" }, { active: "desc" }, { role: "asc" }] },
    },
  });
  if (!student) notFound();

  const tNav = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/office/students`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {tNav("students")}
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{student.user?.name ?? "—"}</h2>
            <p className="text-slate-500 text-sm mt-0.5 font-mono">{student.studentId}</p>
          </div>
          {student.group && <Badge variant="outline" className="text-sm">{student.group.name}</Badge>}
        </div>
      </div>

      <AccessCodeCard studentProfileId={id} />

      <SmsRecipientsCard
        studentId={id}
        contacts={student.smsContacts}
        flagged={student.smsFlagged}
        flagReason={student.smsFlagReason}
      />
    </div>
  );
}
