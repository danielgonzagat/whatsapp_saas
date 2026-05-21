'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Fmt } from './carteira.helpers';
import { IC } from './carteira.config';

export function CarteiraAntecipateModal({
  open,
  onClose,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  pending: number;
}) {
  if (!open) {
    return null;
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text-primary)' }}>
            {kloelT(`Antecipar recebiveis`)}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            {IC.x(16)}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {kloelT(`Disponivel para antecipacao`)}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--app-text-primary)',
              }}
            >
              {kloelT(`R$`)} {Fmt(pending)}
            </span>
          </div>
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 16,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <span style={{ color: colors.semantic.info, display: 'flex', marginTop: 1, flexShrink: 0 }}>
              {IC.clock(16)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.5 }}>
              {kloelT(`Antecipacao ainda nao habilitada para sua conta. Aguarde analise bancaria.`)}
            </span>
          </div>
          <button
            type="button"
            disabled
            style={{
              width: '100%',
              padding: '14px 24px',
              background: 'var(--app-bg-secondary)',
              color: 'var(--app-text-tertiary)',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'not-allowed',
              fontFamily: "'Sora',sans-serif",
              position: 'relative',
            }}
            title={kloelT(`Antecipacao requer aprovacao bancaria`)}
          >
            {kloelT(`Antecipar agora`)}
          </button>
        </div>
      </div>
    </div>
  );
}
