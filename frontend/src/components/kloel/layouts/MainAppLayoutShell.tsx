import { AppShell } from '@/components/kloel/AppShell';
import { PulseFrontendHeartbeat } from '@/components/kloel/PulseFrontendHeartbeat';
import Script from 'next/script';
import { Suspense, type ReactNode } from 'react';

export function MainAppLayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Script src="/kloel-theme-init.js" strategy="afterInteractive" />
      <div className="kloel-app-theme-root">
        <Suspense fallback={null}>
          <PulseFrontendHeartbeat />
        </Suspense>
        <AppShell>{children}</AppShell>
      </div>
    </>
  );
}
