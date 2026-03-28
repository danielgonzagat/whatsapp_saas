'use client';

import dynamic from 'next/dynamic';

const HomeScreen = dynamic(() => import('@/components/kloel/home/HomeScreen').then(mod => ({ default: mod.HomeScreen })), { ssr: false });

export default function DashboardPage() {
  return <HomeScreen />;
}
