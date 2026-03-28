'use client';

import dynamic from 'next/dynamic';

const MarketingView = dynamic(() => import('@/components/kloel/marketing/MarketingView'), { ssr: false });

export default function FacebookPage() { return <MarketingView defaultTab="facebook" />; }
