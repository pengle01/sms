import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import "@/app/globals.css";

// lang is set per-locale below; suppressHydrationWarning stops React
// complaining that the attribute differs between SSR locale and client.
// body gets suppressHydrationWarning because browser extensions (password
// managers etc.) often inject attributes after SSR.

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "greek"],
});

export const metadata: Metadata = {
  title: "School Management System",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-account appearance, applied on <html> so colour + font cascade everywhere.
  let colorTheme = "emerald";
  let fontSize = "small";
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const prefs = await db.user.findUnique({
      where: { id: session.user.id },
      select: { colorTheme: true, fontSize: true },
    });
    colorTheme = prefs?.colorTheme ?? colorTheme;
    fontSize = prefs?.fontSize ?? fontSize;
  }

  return (
    <html
      suppressHydrationWarning
      data-theme={colorTheme}
      data-font={fontSize}
      className={`${inter.variable} h-full`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full antialiased bg-background text-foreground font-[family-name:var(--font-inter)]"
      >
        {children}
      </body>
    </html>
  );
}
