import type { Metadata, Viewport } from 'next';
import type React from 'react';
import './globals.css';
import { AppRootEnhancers } from '@/components/kloel/AppRootEnhancers';
import { jetbrainsMono, sora } from './fonts';

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
    other: [{ rel: 'mask-icon', url: '/kloel-logo-mushroom.svg', color: '#E85D30' }],
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'),
};

export const viewport: Viewport = {
  themeColor: '#0A0A0C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className="dark"
      data-kloel-app-theme="dark"
      style={{ colorScheme: 'dark' }}
      suppressHydrationWarning
    >
      <body
        className={`${sora.variable} ${jetbrainsMono.variable} antialiased`}
        style={{
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          background: '#0A0A0C',
          color: '#E0DDD8',
        }}
      >
        <AppRootEnhancers>{children}</AppRootEnhancers>
      </body>
    </html>
  );
}
