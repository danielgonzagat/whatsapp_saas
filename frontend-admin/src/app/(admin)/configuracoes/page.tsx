'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HonestPlaceholder } from '@/components/admin/honest-placeholder';
import { useAdminSession } from '@/lib/auth/admin-session-context';

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { admin } = useAdminSession();

  useEffect(() => {
    if (admin && admin.role !== 'OWNER') {
      router.replace('/');
    }
  }, [admin, router]);

  if (!admin || admin.role !== 'OWNER') return null;

  return (
    <HonestPlaceholder
      module="Configurações"
      plannedSubProject="SP-11"
      description="Gateways, taxas globais, webhooks, email templates, feature flags, domínios, IAM e infra. Somente OWNER."
    />
  );
}
