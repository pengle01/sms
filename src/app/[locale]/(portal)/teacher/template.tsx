import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { getActiveAuth } from "@/server/authz";
import { db } from "@/server/db";
import { getAttendanceLockConfig } from "@/lib/schoolConfig";
import { getPendingAttendance } from "@/server/attendanceLock";
import { AttendanceLockScreen } from "@/components/attendance/AttendanceLockScreen";

/**
 * Attendance-completion lock gate. This lives in a TEMPLATE (not the layout) on
 * purpose: a shared layout is not re-rendered on client-side navigation between
 * its child pages, so a gate there would go stale and the marking route could
 * never show through. A template re-renders on every navigation, so the lock is
 * re-evaluated per route — and the marking route stays exempt so the lock's
 * "record" links actually open the marking page.
 */
export default async function TeacherTemplate({ children }: { children: React.ReactNode }) {
  const auth = await getActiveAuth();
  if (!auth) return <>{children}</>; // layout handles the real auth redirect

  const lock = await getAttendanceLockConfig();
  if (!lock.enabled) return <>{children}</>;

  // The marking route is exempt so the lock's links can open it.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname.includes("/teacher/attendance/mark")) return <>{children}</>;

  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!staff) return <>{children}</>;

  const pending = await getPendingAttendance(staff.id, lock.window);
  if (pending.length === 0) return <>{children}</>;

  const locale = await getLocale();
  return <AttendanceLockScreen pending={pending} locale={locale} />;
}
