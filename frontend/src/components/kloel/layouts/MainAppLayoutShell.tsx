import { AppShell } from '@/components/kloel/AppShell';
import { PulseFrontendHeartbeat } from '@/components/kloel/PulseFrontendHeartbeat';
import { KloelGraphClient } from '@/components/kloel/graph/KloelGraphClient';
import { isKloelGraphEnabled } from '@/components/kloel/graph/KloelGraph.routes';
import { kloelT } from '@/lib/i18n/t';
import Script from 'next/script';
import { Suspense, type ReactNode } from 'react';

/**
 * Main app layout shell.
 *
 * The owner-authored KloelGraph prototype (KloelGraphClient) is the canonical
 * primary surface: a full-screen constellation where every node opens its screen
 * in a centered 80% overlay. It is self-contained, so route `children` are not
 * rendered while the graph is active. Set NEXT_PUBLIC_KLOEL_GRAPH_ENABLED="false"
 * to fall back to the legacy sidebar AppShell (explicit rollback only).
 */
export function MainAppLayoutShell({ children }: { children: ReactNode }) {
  const graphEnabled = isKloelGraphEnabled();

  return (
    <>
      <Script src="/kloel-theme-init.js" strategy={kloelT(`afterInteractive`)} />
      <div className="kloel-app-theme-root">
        <Suspense fallback={null}>
          <PulseFrontendHeartbeat />
        </Suspense>
        {graphEnabled ? <KloelGraphClient /> : <AppShell>{children}</AppShell>}
      </div>
    </>
  );
}
