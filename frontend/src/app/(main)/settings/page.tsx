'use client';

import dynamic from 'next/dynamic';

const ContaView = dynamic(() => import('@/components/kloel/conta/ContaView'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} />,
});

export default function SettingsPage() {
  return <ContaView />;
}
