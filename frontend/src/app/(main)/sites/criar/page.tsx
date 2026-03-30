'use client';
import dynamic from 'next/dynamic';
const SitesView = dynamic(() => import('@/components/kloel/sites/SitesView'), { ssr: false, loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} /> });
export default function CriarSitePage() { return <SitesView defaultTab="criar" />; }
