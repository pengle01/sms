// Handshake between the attendance mark form and the page it returns to.
//
// The form returns with router.back(), and Next.js restores the previous page
// from its back/forward cache — without the lesson just marked. The form sets a
// flag before going back; the page reads (and clears) it on mount and refreshes
// itself once. Normal visits find no flag and do nothing extra.

const KEY = "sms:attendanceSaved";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage blocked (privacy mode, sandboxed frame)
  }
}

export function markAttendanceSaved(s: Store | null = store()): void {
  try {
    s?.setItem(KEY, "1");
  } catch {
    // best effort: without it the page simply shows its cached state
  }
}

/** True once after markAttendanceSaved; clears the flag. */
export function takeAttendanceSaved(s: Store | null = store()): boolean {
  try {
    if (s?.getItem(KEY) !== "1") return false;
    s.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
