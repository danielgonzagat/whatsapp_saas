'use client';

import dynamic from 'next/dynamic';

const VendasView = dynamic(() => import('@/components/kloel/vendas/VendasView').then(mod => ({ default: mod.VendasView })), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} />
});

export default function AssinaturasPage() {
  return <VendasView defaultTab="assinaturas" />;
}
