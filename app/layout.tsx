import "./globals.css";
import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import AppShell from "@/components/shell/AppShell";
import { SITE_ORIGIN } from "@/lib/siteConfig";

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const SITE_TITLE = "VeriVerse";
const SITE_DESCRIPTION = "Verify. Trust. Earn.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  // Site-wide defaults every page inherits unless it sets its own via
  // generateMetadata (Claim/Post pages do, per P3.2). Deliberately no
  // `images` field - no suitable branded OG image asset exists yet (P3.2
  // audit finding); a stock placeholder would be worse than no image, and a
  // real one can be added later without touching this architecture.
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_TITLE,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
