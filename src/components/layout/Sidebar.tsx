"use client";

import { SidebarContent } from "./SidebarContent";
import type { Role } from "@/generated/prisma";

interface SidebarProps {
  role: Role;
  locale: string;
  portal: string;
  userName?: string;
  pendingClaimsCount?: number;
  /** Other portal this user may switch to (e.g. teacher with extra admin role). */
  crossPortal?: "admin" | "teacher";
}

// Desktop-only persistent sidebar
export function Sidebar({ role, locale, portal, userName, pendingClaimsCount, crossPortal }: SidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen flex-shrink-0">
      <SidebarContent role={role} locale={locale} portal={portal} userName={userName} pendingClaimsCount={pendingClaimsCount} crossPortal={crossPortal} />
    </aside>
  );
}
