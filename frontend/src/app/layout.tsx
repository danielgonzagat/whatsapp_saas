import type React from "react";
import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/kloel/auth/auth-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

const speedInsightsEnabled =
  process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === "true";

export const metadata: Metadata = {
  title: "Kloel — Marketing Artificial",
  description: "A primeira inteligência comercial autônoma do mundo. Tudo que você precisa pra vender na internet. Num lugar só. Com uma IA que age por você.",
  keywords: ["marketing artificial", "IA vendas", "WhatsApp automação", "checkout inteligente", "plataforma all-in-one", "Kloel"],
  authors: [{ name: "Kloel" }],
  robots: { index: true, follow: true },
  openGraph: {
    title: "Kloel — Marketing Artificial",
    description: "A primeira inteligência comercial autônoma do mundo. Tudo que você precisa pra vender na internet.",
    type: "website",
    url: "https://kloel.com",
    siteName: "Kloel",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kloel — Marketing Artificial",
    description: "A primeira inteligência comercial autônoma do mundo.",
  },
  icons: {
    icon: '/icon.svg',
  },
  metadataBase: new URL('https://kloel.com'),
};

export const viewport: Viewport = {
  themeColor: "#0A0A0C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className={`${sora.variable} ${jetbrainsMono.variable} antialiased`} style={{ fontFamily: "var(--font-sora), 'Sora', sans-serif", background: '#0A0A0C', color: '#E0DDD8' }}>
        <AuthProvider>{children}</AuthProvider>
        {speedInsightsEnabled ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
