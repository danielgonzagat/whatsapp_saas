'use client';

import dynamic from 'next/dynamic';

const MarketingView = dynamic(() => import('@/components/kloel/marketing/MarketingView'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0A0A0C' }} />
});

export default function SitePage() { return <MarketingView defaultTab="site" />; }
