'use client';

import dynamic from 'next/dynamic';

const ParceriasView = dynamic(() => import('@/components/kloel/parcerias/ParceriasView'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} />
});

export default function AfiliadosPage() { return <ParceriasView defaultTab="afiliados" />; }
