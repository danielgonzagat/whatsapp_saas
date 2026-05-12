'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { SORA } from './ContaConstants';
import { MetaConnectSection } from './ContaMetaConnectSection';
import type { SettingsSectionKey } from './ContaTypes';

interface ContaAppsSectionProps {
  handleSelectSection: (section: SettingsSectionKey) => void;
  router: {
    push: (url: string) => void;
  };
}

export function ContaAppsSection({ handleSelectSection, router }: ContaAppsSectionProps) {
  return (
    <div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--app-text-primary)',
          margin: '0 0 16px',
          fontFamily: SORA,
        }}
      >
        {kloelT(`Apps e integracoes`)}
      </h2>
      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        {[
          {
            name: 'WhatsApp e Inbox',
            status: 'Operacional',
            connected: true,
            cta: 'Abrir inbox',
            action: () => router.push('/inbox'),
          },
          {
            name: 'Meta Platform',
            status: 'Gerenciar',
            connected: true,
            cta: 'Abrir anuncios',
            action: () => router.push('/anuncios'),
          },
          {
            name: 'Plano e cobranca Kloel',
            status: 'Operacional',
            connected: true,
            cta: 'Abrir billing',
            action: () => handleSelectSection('billing'),
          },
          {
            name: 'CRM e analytics',
            status: 'Ajustar',
            connected: true,
            cta: 'Abrir configuracoes',
            action: () => handleSelectSection('crm'),
          },
        ].map((app) => (
          <div
            key={app.name}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '14px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '16%',
                  background: app.connected ? colors.semantic.success : 'var(--app-text-placeholder)',
                }}
              />
              <div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--app-text-primary)',
                    fontFamily: SORA,
                    display: 'block',
                  }}
                >
                  {app.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                  }}
                >
                  {app.status}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={app.action}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: app.connected
                  ? 'var(--app-text-primary)'
                  : 'var(--app-text-secondary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
                whiteSpace: 'nowrap',
              }}
            >
              {app.cta}
            </button>
          </div>
        ))}
      </div>
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: '14px 18px',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
          }}
        >
          {kloelT(`Integrações publicadas do Kloel`)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            lineHeight: 1.6,
            marginTop: 6,
          }}
        >
          {kloelT(`Esta área agora concentra apenas integrações reais ou já operacionais em outros
          módulos. O que ainda não existe de forma utilizável não aparece mais como
          promessa dentro da sua conta.`)}
        </div>
      </div>
      <MetaConnectSection />
    </div>
  );
}
