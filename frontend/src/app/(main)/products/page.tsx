'use client';

import dynamic from 'next/dynamic';

const ProdutosView = dynamic(() => import('@/components/kloel/produtos/ProdutosView'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} />
});

export default function Page() { return <ProdutosView defaultTab="produtos" />; }
