'use client';

import dynamic from 'next/dynamic';

const KloelCarteira = dynamic(() => import('@/components/kloel/carteira'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} />
});

export default function ExtratoPage() { return <KloelCarteira defaultTab="extrato" />; }
