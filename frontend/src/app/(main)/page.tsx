'use client';

import dynamic from 'next/dynamic';

const HomeScreen = dynamic(
  (() => import('@/components/kloel/home/HomeScreen')) as any,
  { ssr: false }
);

export default function MainRootPage() {
  return <HomeScreen />;
}
