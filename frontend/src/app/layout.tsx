import type React from "react";
import type { Metadata, Viewport } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/kloel/auth/auth-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dm-sans",
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
  themeColor: "#06060C",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${outfit.variable} ${dmSans.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
        {speedInsightsEnabled ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
