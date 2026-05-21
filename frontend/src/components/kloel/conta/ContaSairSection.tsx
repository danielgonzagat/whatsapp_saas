'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useRouter } from 'next/navigation';
import { tokenStorage } from '@/lib/api/core';
import Icons from './ContaIcons';
import { SORA } from './ContaConstants';
import { SectionCard } from './ContaShared';

export default function SairSection() {
  const router = useRouter();

  const handleLogout = () => {
    tokenStorage.clear();
    router.push('/login');
  };

  return (
    <SectionCard title={kloelT(`Sair da conta`)} subtitle={kloelT(`Encerre sua sessao atual`)}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          gap: 16,
          padding: '20px 0',
        }}
      >
        <span style={{ color: colors.semantic.error }}>{Icons.logout(32)}</span>
        <p
          style={{
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            textAlign: 'center' as const,
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {kloelT(`Ao sair, voce sera desconectado desta sessao. Seus dados permanecem salvos e voce podera
          fazer login novamente a qualquer momento.`)}
        </p>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: '12px 32px',
            background: colors.semantic.error,
            border: 'none',
            borderRadius: 6,
            color: colors.text.silver,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: SORA,
            transition: 'all 150ms ease',
          }}
        >
          {kloelT(`Sair da conta`)}
        </button>
      </div>
    </SectionCard>
  );
}
