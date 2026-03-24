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
  description:
    "A plataforma onde o marketing se adapta à inteligência artificial. Venda mais com IA autônoma no WhatsApp, checkout inteligente e automação completa.",
  keywords: ["marketing artificial", "IA", "WhatsApp", "vendas", "automação", "checkout", "plataforma"],
  openGraph: {
    title: "Kloel — Marketing Artificial",
    description:
      "A plataforma onde o marketing se adapta à inteligência artificial.",
    type: "website",
  },
  icons: {
    icon: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0C",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${sora.variable} ${jetbrainsMono.variable} antialiased`} style={{ fontFamily: "var(--font-sora), 'Sora', sans-serif", background: '#0A0A0C', color: '#E0DDD8' }}>
        <AuthProvider>{children}</AuthProvider>
        {speedInsightsEnabled ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
