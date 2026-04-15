import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { AdminSessionProvider } from '@/lib/auth/admin-session-context';
import { jetbrainsMono, sora } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kloel Admin — Painel administrativo',
  description:
    'Centro de comando administrativo da plataforma Kloel. Acesso restrito a administradores autorizados.',
  robots: { index: false, follow: false },
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0C',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className="dark">
      <body
        className={`${sora.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
        style={{
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
        }}
      >
        <ThemeProvider>
          <AdminSessionProvider>{children}</AdminSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
