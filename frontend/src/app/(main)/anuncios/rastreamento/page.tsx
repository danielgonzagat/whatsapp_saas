'use client';

import dynamic from 'next/dynamic';

const AnunciosView = dynamic(() => import('@/components/kloel/anuncios/AnunciosView'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} />
});

export default function RastreamentoPage() {
  return <AnunciosView defaultTab="track" />;
}
