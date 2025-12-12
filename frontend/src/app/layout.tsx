import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "@/components/providers/SessionProvider";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        className="antialiased"
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "#FAFAFA",
          color: "#1A1A1A",
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
        }}
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
