import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Load the design-token typefaces so the product matches the marketing site
// (which loads Inter directly). Without this, "Inter" in the @theme tokens
// silently falls back to the system font (Segoe UI on Windows).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chipmo Sentry",
  description: "AI-powered shoplifting detection for retail",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="mn" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
