import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { SidebarToggleIcon } from './sidebar/SidebarToggleIcon';

export function MobileTopBar({
  activeViewLabel,
  onOpenMenu,
  onSearch,
}: {
  activeViewLabel: string;
  onOpenMenu: () => void;
  onSearch: () => void;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 24,
        padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 12px',
        borderBottom: `1px solid ${KLOEL_THEME.borderPrimary}`,
        background: `color-mix(in srgb, ${KLOEL_THEME.bgPrimary} 96%, transparent)`,
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir navegação"
          style={{
            width: 40,
            height: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: KLOEL_THEME.bgCard,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            borderRadius: 12,
            color: KLOEL_THEME.textPrimary,
            flexShrink: 0,
            boxShadow: KLOEL_THEME.shadowSm,
          }}
        >
          <SidebarToggleIcon color={KLOEL_THEME.textPrimary} size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: KLOEL_THEME.textTertiary,
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: 2,
            }}
          >
            {kloelT(`Kloel`)}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: KLOEL_THEME.textPrimary,
              fontFamily: "'Sora', sans-serif",
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeViewLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={onSearch}
          aria-label="Buscar"
          style={{
            height: 40,
            padding: '0 12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: KLOEL_THEME.bgCard,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            borderRadius: 12,
            color: KLOEL_THEME.textSecondary,
            fontFamily: "'Sora', sans-serif",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            boxShadow: KLOEL_THEME.shadowSm,
          }}
        >
          {kloelT(`Buscar`)}
        </button>
      </div>
    </div>
  );
}

export function KycBanner({
  mobileHeaderOffset,
  isMobile,
  percentage,
  onComplete,
}: {
  mobileHeaderOffset: number;
  isMobile: boolean;
  percentage: number;
  onComplete: () => void;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: mobileHeaderOffset,
        zIndex: 15,
        padding: isMobile ? '12px 16px 0' : '16px 20px 0',
        background: `linear-gradient(180deg, color-mix(in srgb, ${KLOEL_THEME.bgPrimary} 98%, transparent) 0%, color-mix(in srgb, ${KLOEL_THEME.bgPrimary} 90%, transparent) 80%, transparent 100%)`,
      }}
    >
      <div
        style={{
          background: 'color-mix(in srgb, var(--app-warning) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--app-warning) 22%, transparent)',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
        }}
      >
        <div style={{ color: KLOEL_THEME.warning, display: 'flex', alignItems: 'center' }}>
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path d={kloelT(`M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z`)} />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: KLOEL_THEME.textPrimary,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {kloelT(`Cadastro incompleto`)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: KLOEL_THEME.textSecondary,
              marginTop: 4,
              lineHeight: 1.5,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {kloelT(`A navegação continua liberada. Finalize o cadastro para publicar, sacar e liberar todas
            as operações sensíveis.`)}
          </div>
        </div>
        <div style={{ textAlign: 'right' as const, minWidth: 80 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: KLOEL_THEME.warning,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {percentage}%
          </div>
          <div
            style={{
              fontSize: 9,
              color: KLOEL_THEME.textTertiary,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            completo
          </div>
        </div>
        <button
          type="button"
          onClick={onComplete}
          style={{
            background: KLOEL_THEME.accent,
            color: KLOEL_THEME.textOnAccent,
            border: 'none',
            borderRadius: 6,
            padding: '10px 16px',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'Sora', sans-serif",
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {kloelT(`Completar cadastro`)}
        </button>
      </div>
    </div>
  );
}
