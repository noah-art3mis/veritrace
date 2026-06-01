import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// "The machine speaks in monospace; the human verdict is editorial."
// Fraunces (high-contrast editorial serif) = the human/journalistic voice — the
// wordmark and the verdicts the Fact-checker owns. IBM Plex Mono = the machine's
// observable reasoning. IBM Plex Sans = neutral body.
const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VERITRACE — Observable AI fact checker",
  description:
    "Paste a viral claim and watch an AI fact-check it live: it decomposes the claim, asks the questions a fact-checker would, and gathers primary sources into a traversable evidence graph. The verdict is advisory — you make the call.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
