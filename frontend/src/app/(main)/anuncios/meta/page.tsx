'use client';

import dynamic from 'next/dynamic';

const AnunciosView = dynamic(() => import('@/components/kloel/anuncios/AnunciosView'), { ssr: false });

export default function MetaAdsPage() {
  return <AnunciosView defaultTab="meta" />;
}
