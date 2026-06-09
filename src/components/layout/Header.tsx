"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
}

export function Header({ userName, userImage, locale, pageTitle, role, portal, pendingClaimsCount, crossPortal, ddkCoordinator }: HeaderProps) {
  const t = useTranslations("auth");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const switchLocale = () => {
    const newLocale = locale === "en" ? "el" : "en";
    const newPath = window.location.pathname.replace(`/${locale}/`, `/${newLocale}/`);
    router.push(newPath);
  };

  const initials = userName?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      <header className="print:hidden flex items-center justify-between h-14 px-4 md:px-6 border-b border-slate-200 bg-white flex-shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3">
          {role && portal && (
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-200 touch-manipulation"
              aria-label="Open menu"
            >
              {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
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

      {/* Mobile drawer — portalled to document.body to escape any layout overflow/stacking constraints */}
      {mounted && role && portal && drawerOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.5)" }}
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <div
            style={{ position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 9999, width: "min(18rem, 85vw)" }}
          >
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white touch-manipulation"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent
              role={role}
              locale={locale}
              portal={portal}
              userName={userName}
              onNavigate={() => setDrawerOpen(false)}
              pendingClaimsCount={pendingClaimsCount}
              crossPortal={crossPortal}
              ddkCoordinator={ddkCoordinator}
            />
          </div>
        </>,
        document.body
      )}
    </>
  );
}
