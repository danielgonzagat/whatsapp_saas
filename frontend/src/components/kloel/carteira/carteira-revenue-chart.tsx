'use client';
import { kloelT } from '@/lib/i18n/t';
import { formatCompactNumber } from './carteira.helpers';

export function RevenueChart({ data }: { data: number[] }) {
  const revenueWeek = data.length > 0 ? data : [0, 0, 0, 0, 0, 0, 0];
  const hasRevenue = revenueWeek.some((v) => v > 0);
  const dayKeys = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
  const max = Math.max(...revenueWeek);

  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 20,
        position: 'relative',
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          display: 'block',
          marginBottom: 16,
        }}
      >
        {kloelT(`Receita — Ultimos 7 dias`)}
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          height: 100,
          position: 'relative',
        }}
      >
        {hasRevenue
          ? revenueWeek.map((v, i) => (
              <div
                key={`rev-bar-${dayKeys[i]}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 8,
                    color: 'var(--app-text-tertiary)',
                  }}
                >
                  {formatCompactNumber(v)}
                </span>
                <div
                  style={{
                    width: '100%',
                    height: `${(v / max) * 70}px`,
                    background:
                      i === revenueWeek.length - 1
                        ? 'colors.ember.primary'
                        : 'colors.ember.primary40',
                    borderRadius: '4px 3px 0 0',
                  }}
                />
              </div>
            ))
          : revenueWeek.map((_, i) => (
              <div
                key={`empty-bar-${dayKeys[i]}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 2,
                    background: 'var(--app-bg-secondary)',
                    borderRadius: '4px 3px 0 0',
                  }}
                />
              </div>
            ))}
        {!hasRevenue && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--app-text-tertiary)',
                fontFamily: "'Sora',sans-serif",
              }}
            >
              {kloelT(`Nenhuma receita ainda`)}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((d) => (
          <span
            key={d}
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 9,
              color: 'var(--app-text-tertiary)',
              flex: 1,
              textAlign: 'center',
            }}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
