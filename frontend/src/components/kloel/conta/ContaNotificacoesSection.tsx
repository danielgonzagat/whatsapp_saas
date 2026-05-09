'use client';

import { kloelT } from '@/lib/i18n/t';

export default function NotificacoesSection() {
  return (
    <SectionCard
      title={kloelT(`Notificacoes`)}
      subtitle={kloelT(`Escolha como deseja ser notificado`)}
    >
      <div style={{ padding: '16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)', fontFamily: SORA }}
          >
            {kloelT(`Notificacoes por e-mail ativas`)}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA, lineHeight: 1.5 }}>
          {kloelT(`Hoje o Kloel envia avisos de vendas e atualizacoes de conta por e-mail. Quando as
          preferencias granulares forem liberadas, elas aparecerão aqui sem mudar o fluxo da sua
          conta.`)}
        </p>
      </div>
    </SectionCard>
  );
}

import { SectionCard } from './ContaShared';
import { SORA } from './ContaConstants';
