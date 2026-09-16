import type { Metadata, Viewport } from "next";
import { PenyediaTema, SKRIP_ANTI_KEDIP } from "@/components/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: "LPS — Pendanaan Penelitian",
  description:
    "Portal evaluasi proposal Program Pendanaan Penelitian LPS dan FEB UI terhadap KAK-1/GRIS/2026 poin 7 sampai 8.3.",
  icons: { icon: "/assets/lps-mark.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
    { media: "(prefers-color-scheme: light)", color: "#F4F7FC" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-tema="gelap" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: SKRIP_ANTI_KEDIP }} />
      </head>
      <body>
        <PenyediaTema>{children}</PenyediaTema>
      </body>
    </html>
  );
}
