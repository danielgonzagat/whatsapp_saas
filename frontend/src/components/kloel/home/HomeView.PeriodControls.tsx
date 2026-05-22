'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';

const FONT_SANS = "'Sora', sans-serif";

export const PERIOD_OPTIONS: Array<{ key: 'today' | '30d' | 'custom'; label: string }> = [
  { key: 'today', label: 'Hoje' },
  { key: '30d', label: '30 dias' },
  { key: 'custom', label: 'Personalizado' },
];

export function PeriodTabs({
  period,
  onSelect,
}: {
  period: 'today' | '30d' | 'custom';
  onSelect: (next: 'today' | '30d' | 'custom') => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        background: KLOEL_THEME.bgSecondary,
        border: `1px solid ${KLOEL_THEME.borderSubtle}`,
        borderRadius: 6,
        flexWrap: 'wrap',
      }}
    >
      {PERIOD_OPTIONS.map((item) => {
        const active = period === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 4,
              border: active ? `1px solid ${KLOEL_THEME.accent}` : '1px solid transparent',
              background: active ? KLOEL_THEME.bgCard : 'transparent',
              color: active ? KLOEL_THEME.accent : KLOEL_THEME.textSecondary,
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              fontFamily: FONT_SANS,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

interface PeriodPopoverProps {
  compact: boolean;
  customStartDate: string;
  customEndDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
}

export function PeriodPopover({
  compact,
  customStartDate,
  customEndDate,
  onStartDateChange,
  onEndDateChange,
  onClose,
  onApply,
}: PeriodPopoverProps) {
  return (
    <div
      style={{
        position: compact ? 'relative' : 'absolute',
        top: compact ? undefined : 86,
        right: compact ? undefined : 24,
        marginTop: compact ? 18 : 0,
        width: compact ? '100%' : 360,
        maxWidth: 'min(100%, 360px)',
        borderRadius: 6,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        background: KLOEL_THEME.bgCard,
        boxShadow: KLOEL_THEME.shadowLg,
        padding: 16,
        boxSizing: 'border-box',
        overflow: 'hidden',
        zIndex: 120,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
        {kloelT('Período personalizado')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: KLOEL_THEME.textTertiary }}>
            {kloelT('De')}
          </span>
          <input
            type="date"
            value={customStartDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            style={{
              width: '100%',
              minWidth: 0,
              maxWidth: '100%',
              boxSizing: 'border-box',
              height: 40,
              borderRadius: 6,
              border: `1px solid ${KLOEL_THEME.borderInput}`,
              background: KLOEL_THEME.bgInput,
              color: KLOEL_THEME.textPrimary,
              padding: '0 12px',
              fontFamily: FONT_SANS,
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: KLOEL_THEME.textTertiary }}>
            {kloelT('Até')}
          </span>
          <input
            type="date"
            value={customEndDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            style={{
              width: '100%',
              minWidth: 0,
              maxWidth: '100%',
              boxSizing: 'border-box',
              height: 40,
              borderRadius: 6,
              border: `1px solid ${KLOEL_THEME.borderInput}`,
              background: KLOEL_THEME.bgInput,
              color: KLOEL_THEME.textPrimary,
              padding: '0 12px',
              fontFamily: FONT_SANS,
            }}
          />
        </label>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            minWidth: 0,
            height: 38,
            borderRadius: 6,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: 'transparent',
            color: KLOEL_THEME.textSecondary,
            fontFamily: FONT_SANS,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {kloelT('Fechar')}
        </button>
        <button
          type="button"
          onClick={onApply}
          style={{
            width: '100%',
            minWidth: 0,
            height: 38,
            borderRadius: 6,
            border: 'none',
            background: KLOEL_THEME.accent,
            color: KLOEL_THEME.textOnAccent,
            fontFamily: FONT_SANS,
            fontWeight: 700,
            cursor: 'pointer',
            opacity: customStartDate && customEndDate ? 1 : 0.5,
          }}
        >
          {kloelT('Aplicar')}
        </button>
      </div>
    </div>
  );
}
