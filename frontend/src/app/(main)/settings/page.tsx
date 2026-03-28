'use client';

import dynamic from 'next/dynamic';

const ContaView = dynamic(() => import('@/components/kloel/conta/ContaView'), { ssr: false });

export default function SettingsPage() {
  return <ContaView />;
}
