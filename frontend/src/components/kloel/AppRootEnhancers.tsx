'use client';

import { CookieProvider } from '@/components/kloel/cookies/CookieProvider';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ReactNode } from 'react';

const speedInsightsEnabled = process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === 'true';

export function AppRootEnhancers({ children }: { children: ReactNode }) {
  return (
    <>
      <CookieProvider>{children}</CookieProvider>
      {speedInsightsEnabled ? <SpeedInsights /> : null}
    </>
  );
}
