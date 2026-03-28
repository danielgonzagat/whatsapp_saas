'use client';

import dynamic from 'next/dynamic';

const MarketingView = dynamic(() => import('@/components/kloel/marketing/MarketingView'), { ssr: false });

export default function WhatsAppPage() { return <MarketingView defaultTab="whatsapp" />; }
