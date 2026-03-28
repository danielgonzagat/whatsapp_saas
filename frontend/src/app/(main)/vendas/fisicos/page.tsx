'use client';

import dynamic from 'next/dynamic';

const VendasView = dynamic(() => import('@/components/kloel/vendas/VendasView').then(mod => ({ default: mod.VendasView })), { ssr: false });

export default function FisicosPage() {
  return <VendasView defaultTab="fisicos" />;
}
