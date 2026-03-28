'use client';

import dynamic from 'next/dynamic';

const VendasView = dynamic(() => import('@/components/kloel/vendas/VendasView').then(mod => ({ default: mod.VendasView })), { ssr: false });

export default function PipelinePage() {
  return <VendasView defaultTab="pipeline" />;
}
