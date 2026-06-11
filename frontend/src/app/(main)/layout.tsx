import { MainAppLayoutShell } from '@/components/kloel/layouts/MainAppLayoutShell';
import type { Metadata } from 'next';
import { KloelGraphClient } from '@/components/kloel/graph/KloelGraphClient';

/** Dynamic. */
export const dynamic = 'force-dynamic';

/** Metadata. */
export const metadata: Metadata = {
  title: 'Kloel — Marketing Artificial',
  description: 'A plataforma onde o marketing se adapta à inteligência artificial.',
};

/** Main layout. */
// KloelGraph (owner-authored prototype) is the primary navigation surface.
// Defaults ON; set NEXT_PUBLIC_KLOEL_GRAPH_ENABLED="false" to fall back to the
// classic sidebar AppShell (rollback switch).
function isKloelGraphEnabled(): boolean {
  return process.env.NEXT_PUBLIC_KLOEL_GRAPH_ENABLED !== 'false';
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  if (isKloelGraphEnabled()) {
    return <KloelGraphClient>{children}</KloelGraphClient>;
  }
  return <MainAppLayoutShell>{children}</MainAppLayoutShell>;
}
