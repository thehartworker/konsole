import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { DEFAULT_THEME, themeAlsCssVariablen } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Konsole",
  description: "Intake-Konsole",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" style={themeAlsCssVariablen(DEFAULT_THEME) as CSSProperties}>
      <body className="min-h-screen bg-surface-subtle text-ink antialiased">{children}</body>
    </html>
  );
}
