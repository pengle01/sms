import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning className={`${inter.variable} h-full`}>
      <body
        suppressHydrationWarning
        className="min-h-full antialiased bg-background text-foreground font-[family-name:var(--font-inter)]"
      >
        {children}
      </body>
    </html>
  );
}
