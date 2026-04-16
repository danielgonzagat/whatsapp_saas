import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { AdminChatHistoryProvider } from '@/lib/admin-chat-history';
import { AdminSessionProvider } from '@/lib/auth/admin-session-context';
import { jetbrainsMono, sora } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kloel',
  description:
    'Centro de comando administrativo da plataforma Kloel. Acesso restrito a administradores autorizados.',
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/kloel-mushroom-animated.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
  },
};

export const viewport: Viewport = {
  // Viewport theme color is the LIGHT default. When the user flips the
  // toggle to dark we update meta[name=theme-color] at runtime via
  // ThemeToggle to match the active palette.
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${sora.variable} ${jetbrainsMono.variable} antialiased`}
        style={{
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
        }}
      >
        <ThemeProvider>
          {/*
            `.kloel-app-theme-root` scopes the `--app-*` tokens to the app
            shell. This class is required for the theme to actually take
            effect — outside it, globals.css falls back to dark-only tokens
            that live on the `:root` selector.
          */}
          <div className="kloel-app-theme-root min-h-svh bg-background text-foreground">
            <AdminSessionProvider>
              <AdminChatHistoryProvider>{children}</AdminChatHistoryProvider>
            </AdminSessionProvider>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
