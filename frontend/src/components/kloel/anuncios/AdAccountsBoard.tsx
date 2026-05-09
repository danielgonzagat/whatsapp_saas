'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { IC, NP, FmtMoney, roasColor, G, SORA, MONO } from './AnunciosShared';
import type { PlatformKey, PlatformData } from './anuncios-types';

const LIVE = G;

export function AdAccountsBoard({
  platforms,
  onConnectPlatform,
}: {
  platforms: Record<PlatformKey, PlatformData>;
  onConnectPlatform: (platformKey: PlatformKey) => void;
}) {
  const keys = Object.keys(platforms) as PlatformKey[];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
      }}
    >
      {keys.map((key) => {
        const p = platforms[key];
        const pIcon = key === 'meta' ? IC.meta : key === 'google' ? IC.gads : IC.tads;
        return (
          <div
            key={key}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              overflow: 'hidden' as const,
              position: 'relative' as const,
              transition: 'border-color 150ms ease',
            }}
          >
            <div style={{ height: 2, background: p.connected ? p.color : colors.text.dim }} />
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ color: p.color }}>{pIcon(14)}</span>
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: SORA,
                    color: 'var(--app-text-primary)',
                    fontWeight: 600,
                  }}
                >
                  {p.name}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: p.connected ? LIVE : colors.text.dim,
                    flexShrink: 0,
                  }}
                />
              </div>
              {p.connected ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, fontFamily: MONO, color: 'var(--app-text-secondary)' }}>
                        SPEND
                      </div>
                      <div style={{ fontSize: 16, fontFamily: MONO, color: '#EF4444', fontWeight: 600 }}>
                        {FmtMoney(p.spend)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: 10, fontFamily: MONO, color: 'var(--app-text-secondary)' }}>
                        REV
                      </div>
                      <div style={{ fontSize: 16, fontFamily: MONO, color: LIVE, fontWeight: 600 }}>
                        {FmtMoney(p.revenue)}
                      </div>
                    </div>
                  </div>
                  <NP color={p.color} intensity={p.roas / 5} width={200} height={28} />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 8,
                    }}
                  >
                    <div
                      style={{ fontSize: 18, fontFamily: MONO, fontWeight: 700, color: roasColor(p.roas) }}
                    >
                      {p.roas.toFixed(2)}x
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: LIVE,
                          animation: 'pulse 2s infinite',
                        }}
                      />
                      <span style={{ fontSize: 10, fontFamily: MONO, color: 'var(--app-text-secondary)' }}>
                        LIVE
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: SORA,
                      color: 'var(--app-text-secondary)',
                      lineHeight: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    {kloelT(`Conecte sua conta`)} {p.name} {kloelT(`para ver metricas reais`)}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    {['SPEND', 'REV', 'ROAS', 'CTR'].map((label) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, fontFamily: MONO, color: 'var(--app-text-tertiary)' }}>
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontFamily: MONO,
                            color: 'var(--app-text-tertiary)',
                            fontWeight: 600,
                          }}
                        >
                          {kloelT(`&mdash;`)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <NP color={colors.text.dim} intensity={0} width={200} height={28} />
                  <button
                    type="button"
                    onClick={() => onConnectPlatform(key)}
                    style={{
                      marginTop: 12,
                      width: '100%',
                      padding: '8px 0',
                      background: `${p.color}18`,
                      border: `1px solid ${p.color}44`,
                      borderRadius: 6,
                      color: p.color,
                      fontSize: 12,
                      fontFamily: SORA,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 150ms ease',
                    }}
                  >
                    {kloelT(`Conectar`)} {p.name}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
