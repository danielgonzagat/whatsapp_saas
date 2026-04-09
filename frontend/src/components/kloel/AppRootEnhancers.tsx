'use client';

import type { ReactNode } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { CookieProvider } from '@/components/kloel/cookies/CookieProvider';

const speedInsightsEnabled = process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === 'true';

export function AppRootEnhancers({ children }: { children: ReactNode }) {
  return (
    <>
      <CookieProvider>{children}</CookieProvider>
      {speedInsightsEnabled ? <SpeedInsights /> : null}
    </>
  );
}
