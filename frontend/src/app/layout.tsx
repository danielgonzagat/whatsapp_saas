import type React from "react";
import type { Metadata, Viewport } from "next";
import { Inter, Libre_Baskerville } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/kloel/auth/auth-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
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
};

export const viewport: Viewport = {
  themeColor: "#0D9488",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${libreBaskerville.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
        {speedInsightsEnabled ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
