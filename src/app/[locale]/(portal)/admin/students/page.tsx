import { db } from "@/server/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Search } from "lucide-react";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; groupId?: string; page?: string }>;
}) {
  const { search, groupId, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const limit = 30;

  const where = {
    ...(groupId ? { groupId } : {}),
    ...(search
      ? { user: { name: { contains: search, mode: "insensitive" as const } } }
      : {}),
  };

  const [total, students, groups] = await Promise.all([
    db.studentProfile.count({ where }),
    db.studentProfile.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, isActive: true } },
        group: true,
      },
      orderBy: { user: { name: "asc" } },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.group.findMany({ orderBy: [{ grade: "asc" }, { name: "asc" }] }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Students</h2>
          <p className="text-slate-500 text-sm mt-1">{total} students enrolled</p>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by name..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          name="groupId"
          defaultValue={groupId ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Filter
        </button>
      </form>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Group</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{s.user.name}</td>
                  <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">{s.studentId}</td>
                  <td className="px-5 py-3.5">
                    {s.group ? (
                      <Badge variant="outline" className="text-xs">{s.group.name}</Badge>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{s.user.email}</td>
                  <td className="px-5 py-3.5">
                    <Badge
                      className={s.user.isActive
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"}
                      variant="outline"
                    >
                      {s.user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-slate-400">
                    <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`?page=${page - 1}${search ? `&search=${search}` : ""}${groupId ? `&groupId=${groupId}` : ""}`}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                Previous
              </a>
            )}
            {page < totalPages && (
              <a href={`?page=${page + 1}${search ? `&search=${search}` : ""}${groupId ? `&groupId=${groupId}` : ""}`}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
