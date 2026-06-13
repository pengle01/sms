"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Globe, Menu, X } from "lucide-react";
import { SidebarContent } from "./SidebarContent";
import { NotificationBell } from "./NotificationBell";
import { AppearanceDialog } from "./AppearanceDialog";
import type { Role } from "@/generated/prisma";

interface HeaderProps {
  userName?: string;
  userImage?: string;
  locale: string;
  pageTitle?: string;
  role?: Role;
  portal?: string;
  pendingClaimsCount?: number;
  crossPortal?: "admin" | "teacher";
  ddkCoordinator?: boolean;
  specialEdAccess?: boolean;
}

// Stable id linking the hamburger <label> to its checkbox. The mobile drawer is
// driven by this checkbox + CSS (peer-checked) — NOT React state — so it opens
// and its links navigate even before the client island has hydrated. On a slow
// phone a tap on the hamburger used to do nothing until hydration finished; the
// pure-CSS toggle removes that dependency entirely.
const MENU_ID = "mobile-nav-toggle";

export function Header({ userName, userImage, locale, pageTitle, role, portal, pendingClaimsCount, crossPortal, ddkCoordinator, specialEdAccess }: HeaderProps) {
  const t = useTranslations("auth");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Close profile popover when tapping outside
  useEffect(() => {
    function handler(e: MouseEvent | TouchEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  // After hydration, a client-side navigation keeps the checkbox checked (no full
  // page load to reset it), so explicitly uncheck on nav. Pre-hydration this never
  // runs — links do a full navigation which resets the checkbox naturally.
  const closeDrawer = () => {
    const el = document.getElementById(MENU_ID) as HTMLInputElement | null;
    if (el) el.checked = false;
  };

  const switchLocale = () => {
    const newLocale = locale === "en" ? "el" : "en";
    const newPath = window.location.pathname.replace(`/${locale}/`, `/${newLocale}/`);
    router.push(newPath);
  };

  const initials = userName?.[0]?.toUpperCase() ?? "?";
  const hasDrawer = !!role && !!portal;

  return (
    <>
      {/* Hidden checkbox drives the mobile drawer via CSS. Must precede the
          header + drawer in the DOM so peer-checked can reach them. */}
      {hasDrawer && (
        <input
          type="checkbox"
          id={MENU_ID}
          className="peer sr-only"
          aria-label="Open menu"
        />
      )}

      <header className="print:hidden flex items-center justify-between h-14 px-4 md:px-6 border-b border-slate-200 bg-white flex-shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3">
          {hasDrawer && (
            <label
              htmlFor={MENU_ID}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-200 touch-manipulation cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </label>
          )}
          <h1 className="text-base font-semibold text-slate-900 truncate">{pageTitle}</h1>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {role && <NotificationBell locale={locale} />}

          <Button
            variant="ghost"
            size="sm"
            onClick={switchLocale}
            className="text-slate-500 gap-1.5 text-xs touch-manipulation"
          >
            <Globe className="w-3.5 h-3.5" />
            {locale === "en" ? "ΕΛ" : "EN"}
          </Button>

          {/* Profile popover */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white text-sm font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 overflow-hidden"
              aria-label="User menu"
            >
              {userImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userImage} alt={userName} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900 truncate">{userName}</p>
                  {role && (
                    <p className="text-xs text-slate-500 mt-0.5">{tRoles(role)}</p>
                  )}
                </div>
                <AppearanceDialog />
                <a
                  href={`/api/logout?locale=${locale}`}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 touch-manipulation border-t border-slate-100"
                >
                  <LogOut className="w-4 h-4" />
                  {t("logout")}
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer — shown purely via CSS when the checkbox is checked, so it
          works with no JS. Rendered inline (fixed-positioned + high z-index) so it
          escapes the layout's overflow without needing a JS portal. */}
      {hasDrawer && (
        <div className="hidden peer-checked:block lg:!hidden print:!hidden">
          {/* Backdrop — tapping it closes the drawer (label toggles the checkbox) */}
          <label
            htmlFor={MENU_ID}
            aria-label="Close menu"
            className="fixed inset-0 z-[9998] bg-black/50"
          />
          {/* Panel */}
          <div className="fixed top-0 left-0 bottom-0 z-[9999] w-[min(18rem,85vw)]">
            <label
              htmlFor={MENU_ID}
              aria-label="Close menu"
              className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white touch-manipulation cursor-pointer"
            >
              <X className="w-4 h-4" />
            </label>
            <SidebarContent
              role={role!}
              locale={locale}
              portal={portal!}
              userName={userName}
              onNavigate={closeDrawer}
              pendingClaimsCount={pendingClaimsCount}
              crossPortal={crossPortal}
              ddkCoordinator={ddkCoordinator}
              specialEdAccess={specialEdAccess}
            />
          </div>
        </div>
      )}
    </>
  );
}
