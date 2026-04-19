import type { Metadata } from 'next';
import type React from 'react';
import { PublicLayoutShell } from './public-layout-shell';

const facebookDomainVerification = String(
  process.env.NEXT_PUBLIC_FACEBOOK_DOMAIN_VERIFICATION || '',
).trim();

export const metadata: Metadata = {
  other: facebookDomainVerification
    ? {
        'facebook-domain-verification': facebookDomainVerification,
      }
    : undefined,
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
