'use client';

import { CookieProvider } from '@/components/kloel/cookies/CookieProvider';
import { SWRProvider } from '@/components/kloel/SWRProvider';
import { ToastProvider } from '@/components/kloel/ToastProvider';
import { AuthProvider } from '@/components/kloel/auth/auth-provider';
import { ThemeProvider } from '@/components/kloel/theme/ThemeProvider';
import { ConversationHistoryProvider } from '@/hooks/useConversationHistory';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ReactNode } from 'react';

const speedInsightsEnabled = process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === 'true';

/** App root enhancers. */
export function AppRootEnhancers({ children }: { children: ReactNode }) {
  return (
    <>
      <CookieProvider>
        <AuthProvider>
          <SWRProvider>
            <ConversationHistoryProvider>
              <ToastProvider>
                <ThemeProvider>{children}</ThemeProvider>
              </ToastProvider>
            </ConversationHistoryProvider>
          </SWRProvider>
        </AuthProvider>
      </CookieProvider>
      {speedInsightsEnabled ? <SpeedInsights /> : null}
    </>
  );
}
