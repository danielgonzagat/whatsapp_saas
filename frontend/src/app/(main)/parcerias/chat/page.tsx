'use client';

import dynamic from 'next/dynamic';

const ParceriasView = dynamic(() => import('@/components/kloel/parcerias/ParceriasView'), { ssr: false });

export default function ChatParceirosPage() { return <ParceriasView defaultTab="chat" />; }
