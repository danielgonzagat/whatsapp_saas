'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AdminAppShell } from '@/components/admin/admin-app-shell';
import { useAdminSession } from '@/lib/auth/admin-session-context';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { admin, isBooting } = useAdminSession();

  useEffect(() => {
    if (!isBooting && !admin) {
      router.replace('/login');
    }
  }, [isBooting, admin, router]);

  if (isBooting || !admin) {
    // Render nothing on the initial hydration tick to avoid a flash of
    // protected content. The effect above will redirect unauthenticated
    // visitors immediately.
    return null;
  }

  return <AdminAppShell>{children}</AdminAppShell>;
}
