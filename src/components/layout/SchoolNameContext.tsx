"use client";

import { createContext, useContext } from "react";

// The admin-configured school name (GlobalSetting "school_name"), provided by
// the shared portal layout. Null means "not configured" — consumers fall back
// to the translated app name.
const SchoolNameContext = createContext<string | null>(null);

export function SchoolNameProvider({
  value,
  children,
}: {
  value: string | null;
  children: React.ReactNode;
}) {
  return <SchoolNameContext.Provider value={value}>{children}</SchoolNameContext.Provider>;
}

export function useSchoolName(): string | null {
  return useContext(SchoolNameContext);
}
