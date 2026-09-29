"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { takeAttendanceSaved } from "@/lib/attendanceRefresh";

/**
 * Render on pages that show whether attendance was taken and link to the mark
 * page. After a save, the mark form goes back here and Next restores this page
 * from its back/forward cache; this refetches it once so the new tick shows.
 */
export function RefreshAfterAttendance() {
  const router = useRouter();
  useEffect(() => {
    if (takeAttendanceSaved()) router.refresh();
  }, [router]);
  return null;
}
