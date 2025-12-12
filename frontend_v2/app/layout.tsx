import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "KLOEL - Sua Inteligência Comercial Autônoma",
  description:
    "O Kloel é seu vendedor pessoal e inteligência comercial autônoma. Automatize suas vendas no WhatsApp com IA.",
    generator: 'v0.app'
}

export const viewport: Viewport = {
  themeColor: "#F8F8F8",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  )
}
