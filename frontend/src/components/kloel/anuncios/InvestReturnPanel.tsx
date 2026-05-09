'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { IC, G, SORA, MONO } from './AnunciosShared';
import type { PlatformKey, PlatformData, KeywordEntry } from './anuncios-types';

const R = '#EF4444';

export function InvestReturnPanel({
  platforms,
  hasData,
  keywords,
}: {
  platforms: Record<PlatformKey, PlatformData>;
  hasData: boolean;
  keywords: KeywordEntry[];
}) {
  const keys = Object.keys(platforms) as PlatformKey[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: MONO,
            color: 'var(--app-text-secondary)',
            letterSpacing: 1,
            marginBottom: 12,
          }}
        >
          {kloelT(`INVESTIMENTO vs RETORNO`)}
        </div>
        {hasData ? (
          keys.map((key) => {
            const p = platforms[key];
            const maxVal = Math.max(p.spend, p.revenue);
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: MONO,
                    color: 'var(--app-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  {p.name}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: R,
                      width: `${maxVal > 0 ? (p.spend / maxVal) * 100 : 0}%`,
                      transition: 'width 150ms ease',
                    }}
                  />
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: G,
                      width: `${maxVal > 0 ? (p.revenue / maxVal) * 100 : 0}%`,
                      transition: 'width 150ms ease',
                    }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              fontSize: 12,
              fontFamily: SORA,
              color: 'var(--app-text-tertiary)',
              textAlign: 'center' as const,
              padding: '16px 0',
            }}
          >
            {kloelT(`Sem dados de campanha`)}
          </div>
        )}
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: MONO,
            color: 'var(--app-text-secondary)',
            letterSpacing: 1,
            marginBottom: 12,
          }}
        >
          {kloelT(`TOP KEYWORDS`)}
        </div>
        {keywords.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {keywords.map((kw) => (
              <div
                key={kw.keyword}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  background: 'var(--app-bg-secondary)',
                  borderRadius: 6,
                }}
              >
                <span style={{ color: 'var(--app-text-secondary)', flexShrink: 0 }}>
                  {IC.search(12)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: SORA,
                    color: 'var(--app-text-primary)',
                    flex: 1,
                    overflow: 'hidden' as const,
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {kw.keyword}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: MONO,
                    color: G,
                    fontWeight: 600,
                    minWidth: 36,
                    textAlign: 'right' as const,
                  }}
                >
                  {kw.conv} conv
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: MONO,
                    color: 'var(--app-text-secondary)',
                    minWidth: 46,
                    textAlign: 'right' as const,
                  }}
                >
                  {kloelT(`R$`)} {kw.cpc.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              fontFamily: SORA,
              color: 'var(--app-text-tertiary)',
              textAlign: 'center' as const,
              padding: '16px 0',
              lineHeight: 1.6,
            }}
          >
            {kloelT(`Conecte uma plataforma de anuncios para ver keywords.`)}
          </div>
        )}
      </div>
    </div>
  );
}
