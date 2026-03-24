'use client';

import { useRouter } from 'next/navigation';
import { HomeScreen } from '@/components/kloel/home/HomeScreen';

export default function DashboardPage() {
  const router = useRouter();
  return (
    <HomeScreen
      userName="Daniel"
      onSendMessage={(msg) => router.push(`/chat?q=${encodeURIComponent(msg)}`)}
    />
  );
}
