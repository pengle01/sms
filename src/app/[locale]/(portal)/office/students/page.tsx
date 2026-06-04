import { db } from "@/server/db";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { suggestionList } from "@/lib/textSearch";
import { SuggestInput } from "@/components/SuggestInput";

export default async function OfficeStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const tNav = await getTranslations("nav");
  const tLocate = await getTranslations("locate");

  const students = query
    ? await db.studentProfile.findMany({
        where: {
          OR: [
            { user: { name: { contains: query, mode: "insensitive" } } },
            { studentId: { contains: query, mode: "insensitive" } },
          ],
          user: { isActive: true },
        },
        include: { user: { select: { name: true } }, group: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
        take: 50,
      })
    : [];

  // Autocomplete: all active student names
  const suggestionRows = await db.studentProfile.findMany({
    where: { user: { isActive: true } },
    select: { user: { select: { name: true } } },
  });
  const suggestions = suggestionList(suggestionRows.map((s) => s.user?.name));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">{tNav("students")}</h2>

      <form method="GET" className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <SuggestInput
            name="q"
            defaultValue={query}
            autoFocus
            placeholder={tLocate("searchByName")}
            suggestions={suggestions}
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </form>

      {!query && <p className="text-sm text-slate-400">{tLocate("enterSearch")}</p>}
      {query && students.length === 0 && <p className="text-sm text-slate-400">{tLocate("noResults")}</p>}

      {students.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {students.map((s) => (
                <Link
                  key={s.id}
                  href={`/${locale}/office/students/${s.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{s.user?.name}</p>
                    <p className="text-xs font-mono text-slate-400">{s.studentId}</p>
                  </div>
                  {s.group && <Badge variant="outline" className="text-xs">{s.group.name}</Badge>}
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
