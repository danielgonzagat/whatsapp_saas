import type React from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/providers/SessionProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KLOEL - Inteligência Artificial para seu Negócio",
  description:
    "Automatize seu atendimento no WhatsApp com inteligência artificial. KLOEL ajuda empresas a vender mais e atender melhor.",
  keywords: ["WhatsApp", "IA", "automação", "chatbot", "atendimento", "vendas"],
  openGraph: {
    title: "KLOEL - Inteligência Artificial para seu Negócio",
    description:
      "Automatize seu atendimento no WhatsApp com inteligência artificial.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#F8F8F8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} antialiased`}>
        <SessionProvider>
          {children}
        </SessionProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
