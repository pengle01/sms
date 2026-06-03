"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma";
import {
  LayoutDashboard, ClipboardList, AlertTriangle, BookOpen,
  Calendar, CalendarRange, FileText, Bell, Users, Settings, Shield,
  Search, GraduationCap, Home, Backpack, Plus, BookMarked, ShieldAlert,
  CircleUser,
} from "lucide-react";

interface NavItem {
  key: string;
  href: string;
  icon: React.ElementType;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  // ── Educator portal (/teacher) — all who work directly with students ──
  { key: "dashboard",    href: "dashboard",           icon: LayoutDashboard, roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR","TEACHER"] },
  { key: "homegroup",    href: "homegroup",           icon: BookMarked,      roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR","TEACHER"] },
  { key: "timetable",    href: "attendance/schedule", icon: Calendar,        roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR","TEACHER"] },
  { key: "locate",       href: "attendance/locate",   icon: Search,          roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR","TEACHER"] },
  { key: "referrals",    href: "referrals",           icon: AlertTriangle,   roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR","TEACHER"] },
  { key: "grades",       href: "grades",              icon: BookOpen,        roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","TEACHER"] },
  { key: "tests",        href: "tests",               icon: FileText,        roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","TEACHER"] },
  { key: "noticeboard",  href: "noticeboard",       icon: Bell,            roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR","TEACHER"] },
  { key: "activities",   href: "activities",        icon: CalendarRange,   roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR","TEACHER"] },
  { key: "students",     href: "students",          icon: GraduationCap,   roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR"] },
  { key: "groups",       href: "groups",            icon: Home,            roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B"] },
  { key: "profile",      href: "profile",           icon: CircleUser,      roles: ["HEADMASTER","HEADTEACHER_A","HEADTEACHER_B","STUDENT_COUNSELOR","TEACHER"] },

  // ── Office portal (/office) — student data & attendance ─────────────
  { key: "dashboard",    href: "dashboard",         icon: LayoutDashboard, roles: ["SCHOOL_ADMIN"] },
  { key: "attendance",   href: "attendance",        icon: ClipboardList,   roles: ["SCHOOL_ADMIN"] },
  { key: "students",     href: "students",          icon: GraduationCap,   roles: ["SCHOOL_ADMIN"] },
  { key: "groups",       href: "groups",            icon: Home,            roles: ["SCHOOL_ADMIN"] },
  { key: "noticeboard",  href: "noticeboard",       icon: Bell,            roles: ["SCHOOL_ADMIN"] },

  // ── Admin portal (/admin) — registrations & system ───────────────────
  { key: "dashboard",    href: "dashboard",         icon: LayoutDashboard, roles: ["SUPER_ADMIN"] },
  { key: "claims",       href: "claims",            icon: Backpack,        roles: ["SUPER_ADMIN"] },
  { key: "users",        href: "users",             icon: Users,           roles: ["SUPER_ADMIN"] },
  { key: "students",     href: "students",          icon: GraduationCap,   roles: ["SUPER_ADMIN"] },
  { key: "timetable",    href: "timetable",         icon: Calendar,        roles: ["SUPER_ADMIN"] },
  { key: "homegroups",   href: "homegroups",        icon: Home,            roles: ["SUPER_ADMIN"] },
  { key: "allGroups",    href: "groups",            icon: BookMarked,      roles: ["SUPER_ADMIN"] },
  { key: "checks",       href: "checks",            icon: ShieldAlert,     roles: ["SUPER_ADMIN"] },
  { key: "referrals",    href: "referrals",         icon: AlertTriangle,   roles: ["SUPER_ADMIN"] },
  { key: "calendar",     href: "calendar",          icon: CalendarRange,   roles: ["SUPER_ADMIN"] },
  { key: "auditLog",     href: "audit-log",         icon: Shield,          roles: ["SUPER_ADMIN"] },
  { key: "settings",     href: "settings",          icon: Settings,        roles: ["SUPER_ADMIN"] },

  // ── Student portal ───────────────────────────────────────────────────
  { key: "myAttendance", href: "attendance",        icon: ClipboardList,   roles: ["STUDENT"] },
  { key: "myGrades",     href: "grades",            icon: BookOpen,        roles: ["STUDENT"] },
  { key: "myTests",      href: "tests",             icon: FileText,        roles: ["STUDENT"] },
  { key: "noticeboard",  href: "noticeboard",       icon: Bell,            roles: ["STUDENT"] },

  // ── Parent portal ────────────────────────────────────────────────────
  { key: "children",     href: "children",          icon: GraduationCap,   roles: ["PARENT"] },
  { key: "noticeboard",  href: "noticeboard",       icon: Bell,            roles: ["PARENT"] },

  // ── Chaperone portal ─────────────────────────────────────────────────
  { key: "myStudents",   href: "students",          icon: GraduationCap,   roles: ["CHAPERONE"] },
  { key: "newRequest",   href: "request",           icon: Plus,            roles: ["CHAPERONE"] },
];

interface SidebarContentProps {
  role: Role;
  locale: string;
  portal: string;
  userName?: string;
  onNavigate?: () => void;
  pendingClaimsCount?: number;
}

export function SidebarContent({ role, locale, portal, userName, onNavigate, pendingClaimsCount }: SidebarContentProps) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <div className="flex flex-col h-full bg-emerald-950">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-emerald-900 flex-shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-lime-400 flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-emerald-900" />
        </div>
        <span className="font-semibold text-white text-sm leading-tight">
          {tCommon("appName")}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const href = `/${locale}/${portal}/${item.href}`;
          const isActive = pathname.startsWith(href);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-600 text-white"
                  : "text-emerald-300/70 hover:text-white hover:bg-emerald-800/60"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{t(item.key as Parameters<typeof t>[0])}</span>
              {item.key === "claims" && pendingClaimsCount != null && pendingClaimsCount > 0 && (
                <span className="ml-auto text-xs font-semibold bg-amber-400 text-amber-900 rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                  {pendingClaimsCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-emerald-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center flex-shrink-0">
            <span className="text-emerald-100 text-xs font-medium">
              {userName?.[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-emerald-400 truncate">{role.replace(/_/g, " ")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
