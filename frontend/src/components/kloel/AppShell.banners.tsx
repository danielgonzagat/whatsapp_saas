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
