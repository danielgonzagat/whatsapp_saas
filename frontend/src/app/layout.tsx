import type { Metadata, Viewport } from 'next';
import type React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { DatadogRumRouter } from '@/components/kloel/DatadogRumRouter';
import './globals.css';
import { AppRootEnhancers } from '@/components/kloel/AppRootEnhancers';
import { jetbrainsMono, sora } from './fonts';
import { colors } from '@/lib/design-tokens';

/** Metadata. */
export const metadata: Metadata = {
  title: 'Kloel — Marketing Artificial',
  description:
    'A primeira inteligência comercial autônoma do mundo. Tudo que você precisa pra vender na internet. Num lugar só. Com uma IA que age por você.',
  keywords: [
    'marketing artificial',
    'IA vendas',
    'WhatsApp automação',
    'checkout inteligente',
    'plataforma all-in-one',
    'Kloel',
  ],
  authors: [{ name: 'Kloel' }],
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Kloel — Marketing Artificial',
    description:
      'A primeira inteligência comercial autônoma do mundo. Tudo que você precisa pra vender na internet.',
    type: 'website',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com',
    siteName: 'Kloel',
    locale: 'pt_BR',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Kloel mushroom logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kloel — Marketing Artificial',
    description: 'A primeira inteligência comercial autônoma do mundo.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/kloel-logo-mushroom.svg', type: 'image/svg+xml' },
      { url: '/kloel-icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/kloel-icon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    other: [{ rel: 'mask-icon', url: '/kloel-logo-mushroom.svg', color: colors.ember.primary }],
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'),
};

/** Viewport. */
export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Root layout. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${sora.variable} ${jetbrainsMono.variable} antialiased`}
        style={{
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          background: '#FFFFFF',
          color: colors.background.void,
        }}
      >
        <DatadogRumRouter />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppRootEnhancers>{children}</AppRootEnhancers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
