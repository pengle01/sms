"use client";

import { SidebarContent } from "./SidebarContent";
import type { Role } from "@/generated/prisma";

interface SidebarProps {
  role: Role;
  locale: string;
  portal: string;
  userName?: string;
}

// Desktop-only persistent sidebar
export function Sidebar({ role, locale, portal, userName }: SidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen flex-shrink-0">
      <SidebarContent role={role} locale={locale} portal={portal} userName={userName} />
    </aside>
  );
}
