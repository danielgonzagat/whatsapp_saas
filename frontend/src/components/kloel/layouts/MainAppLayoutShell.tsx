import { AppShell } from '@/components/kloel/AppShell';
import { KloelGraphShell } from '@/components/kloel/graph/KloelGraphShell';
import { isKloelGraphEnabled } from '@/components/kloel/graph/KloelGraph.routes';
import { kloelT } from '@/lib/i18n/t';
import Script from 'next/script';
import type { ReactNode } from 'react';

/** Main app layout shell. */
export function MainAppLayoutShell({ children }: { children: ReactNode }) {
  const Shell = isKloelGraphEnabled() ? KloelGraphShell : AppShell;

  return (
    <>
      <Script src="/kloel-theme-init.js" strategy={kloelT(`afterInteractive`)} />
      <div className="kloel-app-theme-root">
        <Shell>{children}</Shell>
      </div>
    </>
  );
}
