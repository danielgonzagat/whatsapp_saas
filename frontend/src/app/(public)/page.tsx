'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import KloelLanding from '@/components/kloel/landing/KloelLanding';
import { FloatingChat } from '@/components/kloel/landing/FloatingChat';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  return (
    <>
      <KloelLanding />
      <FloatingChat />
    </>
  );
}
