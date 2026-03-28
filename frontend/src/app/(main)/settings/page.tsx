'use client';

import dynamic from 'next/dynamic';

const ContaView = dynamic(() => import('@/components/kloel/conta/ContaView'), {
  ssr: false,
  loading: () => <div style={{ background: '#0A0A0C', minHeight: '100vh' }} />,
});

export default function SettingsPage() {
  return <ContaView />;
}
