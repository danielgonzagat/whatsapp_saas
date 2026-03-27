'use client';
import dynamic from 'next/dynamic';
const ParceriasView = dynamic(() => import('@/components/kloel/parcerias/ParceriasView').then(m => ({ default: m.default })), { ssr: false });
export default function AfiliadosPage() { return <ParceriasView defaultTab="afiliados" />; }
