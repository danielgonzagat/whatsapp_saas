import { colors } from '@/lib/design-tokens';
import { IC } from './VendasView.icons';
import { SORA, MONO } from './utils';

interface StatProps {
  label: string;
  value: string;
  color?: string;
  sub?: string;
  trend?: number | undefined;
}

export function Stat({
  label,
  value,
  color = 'var(--app-text-primary)',
  sub,
  trend,
}: StatProps) {
  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 18,
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
          fontFamily: SORA,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color }}>{value}</span>
        {trend !== undefined && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 10,
              color: trend > 0 ? colors.semantic.success : colors.semantic.error,
            }}
          >
            {trend > 0 ? IC.trend(10) : IC.trendD(10)} {Math.abs(trend)}%
          </span>
        )}
      </div>
      {sub && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--app-text-tertiary)',
            marginTop: 4,
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
