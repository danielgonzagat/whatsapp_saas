'use client';

import dynamic from 'next/dynamic';

const HomeScreen = dynamic(() => import('@/components/kloel/home/HomeScreen').then(mod => ({ default: mod.HomeScreen })), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} />
});

export default function DashboardPage() {
  return <HomeScreen />;
}
