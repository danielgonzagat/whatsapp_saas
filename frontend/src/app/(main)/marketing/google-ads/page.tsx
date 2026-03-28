'use client';
import dynamic from 'next/dynamic';
const MarketingView = dynamic(() => import('@/components/kloel/marketing/MarketingView'), { ssr: false });
export default function GoogleAdsPage() { return <MarketingView defaultTab="google-ads" />; }
