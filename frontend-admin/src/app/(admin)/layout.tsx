'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AdminChatbarSkeleton } from '@/components/admin/admin-chatbar-skeleton';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminTopbar } from '@/components/admin/admin-topbar';
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

  return (
    <div className="flex min-h-svh bg-background">
      <AdminSidebar role={admin.role} />
      <div className="flex flex-1 flex-col">
        <AdminTopbar />
        <main className="flex flex-1 flex-col pb-32">{children}</main>
      </div>
      <AdminChatbarSkeleton />
    </div>
  );
}
