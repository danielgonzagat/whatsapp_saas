'use client';

import dynamic from 'next/dynamic';

const KloelCarteira = dynamic(() => import('@/components/kloel/carteira'), { ssr: false });

export default function ExtratoPage() { return <KloelCarteira defaultTab="extrato" />; }
