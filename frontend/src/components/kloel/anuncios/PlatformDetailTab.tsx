'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { metaAdsApi } from '@/lib/api/meta';
import { IC, FmtMoney, roasColor, G, SORA, MONO } from './AnunciosShared';
import type { Campaign, PlatformKey, PlatformData } from './anuncios-types';

const R = colors.semantic.error;

export function PlatformDetailTab({
  platformKey,
  platform,
  campaigns,
  metaAccessToken,
  onCampaignsChange,
}: {
  platformKey: PlatformKey;
  platform: PlatformData;
  campaigns: Campaign[];
  metaAccessToken?: string;
  onCampaignsChange: (campaigns: Campaign[]) => void;
}) {
  const isConnected = platform.connected;
  const profit = platform.revenue - platform.spend;
  const profitColor = profit >= 0 ? G : R;
  const camps = campaigns.filter((c) => c.platform === platformKey);

  const handleCampaignToggle = async (c: Campaign) => {
    if (platformKey !== 'meta' || !metaAccessToken) {return;}
    const newStatus = c.status === 'active' ? 'PAUSED' : 'ACTIVE';
    await metaAdsApi.updateCampaignStatus(c.id, newStatus);
    onCampaignsChange(
      campaigns.map((x) =>
        x.id === c.id
          ? { ...x, status: newStatus.toLowerCase() === 'active' ? 'active' : 'paused' }
          : x,
      ),
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, animation: 'fadeIn .3s ease' }}>
      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 2, marginBottom: 8 }}>
          LUCRO {platform.name.toUpperCase()}
        </div>
        {isConnected ? (
          <div style={{ fontSize: 64, fontWeight: 800, fontFamily: MONO, color: profitColor, textShadow: `0 0 30px ${profitColor}44`, lineHeight: 1 }}>
            {FmtMoney(profit)}
          </div>
        ) : (
          <div style={{ fontSize: 48, fontWeight: 800, fontFamily: MONO, color: 'var(--app-text-tertiary)', lineHeight: 1 }}>
            {kloelT(`&mdash;`)}
          </div>
        )}
      </div>

      {!isConnected && (
        <div
          style={{
            background: 'var(--app-bg-card)', border: `1px solid ${platform.color}33`,
            borderRadius: 6, padding: 24, textAlign: 'center' as const,
          }}
        >
          <div style={{ fontSize: 14, fontFamily: SORA, color: 'var(--app-text-primary)', fontWeight: 600, marginBottom: 8 }}>
            {kloelT(`Conecte sua conta`)} {platform.name} {kloelT(`para ver metricas reais`)}
          </div>
          <div style={{ fontSize: 12, fontFamily: SORA, color: 'var(--app-text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            {kloelT(`Apos conectar, todas as metricas, campanhas e dados serao importados automaticamente.`)}
          </div>
          <button
            type="button"
            onClick={() => {
              if (platformKey === 'meta') {window.location.href = '/conta';}
            }}
            style={{
              padding: '10px 24px', background: platform.color, border: 'none', borderRadius: 6,
              color: colors.text.silver, fontSize: 13, fontFamily: SORA, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity 150ms ease',
            }}
          >
            {kloelT(`Conectar`)} {platform.name}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {[
          { label: 'GASTO', value: isConnected ? FmtMoney(platform.spend) : '\u2014', color: isConnected ? R : colors.text.dim },
          { label: 'RETORNO', value: isConnected ? FmtMoney(platform.revenue) : '\u2014', color: isConnected ? G : colors.text.dim },
          { label: 'ROAS', value: isConnected ? `${platform.roas.toFixed(2)}x` : '\u2014', color: isConnected ? roasColor(platform.roas) : colors.text.dim },
          { label: 'CONV', value: isConnected ? String(platform.conversions) : '\u2014', color: isConnected ? colors.ember.primary : colors.text.dim },
          { label: 'CTR', value: isConnected ? `${platform.ctr.toFixed(2)}%` : '\u2014', color: isConnected ? colors.text.silver : colors.text.dim },
          { label: 'CPC', value: isConnected ? `R$ ${platform.cpc.toFixed(2)}` : '\u2014', color: 'var(--app-text-secondary)' },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)',
              borderRadius: 6, padding: 14, textAlign: 'center' as const,
            }}
          >
            <div style={{ fontSize: 10, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 6 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: m.color }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)',
          borderRadius: 6, overflow: 'hidden' as const,
        }}
      >
        <div
          style={{
            display: 'grid', gridTemplateColumns: '2fr 0.8fr 1fr 1fr 0.8fr 0.6fr 0.8fr 0.8fr',
            padding: '10px 16px', borderBottom: '1px solid colors.border.space',
          }}
        >
          {['Campanha', 'Status', 'Gasto', 'Retorno', 'ROAS', 'Conv', 'CPC', 'Acoes'].map((h) => (
            <div key={h} style={{ fontSize: 10, fontFamily: MONO, color: 'var(--app-text-tertiary)', letterSpacing: 1, textTransform: 'uppercase' as const }}>
              {h}
            </div>
          ))}
        </div>
        {camps.length > 0 ? (
          camps.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 0.8fr 1fr 1fr 0.8fr 0.6fr 0.8fr 0.8fr',
                padding: '10px 16px', borderBottom: '1px solid var(--app-border-subtle)', alignItems: 'center',
                transition: 'background 150ms ease',
              }}
            >
              <div style={{ fontSize: 12, fontFamily: SORA, color: 'var(--app-text-primary)', overflow: 'hidden' as const, textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {c.name}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 10, fontFamily: MONO, padding: '2px 6px', borderRadius: 4,
                    background: c.status === 'active' ? `${G}18` : 'colors.text.dim18', color: c.status === 'active' ? G : colors.text.muted,
                  }}
                >
                  {c.status === 'active' ? 'Ativo' : 'Pausado'}
                </span>
              </div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: R }}>{FmtMoney(c.spend)}</div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: G }}>{FmtMoney(c.revenue)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 600, color: roasColor(c.roas) }}>
                  {c.roas.toFixed(2)}x
                </span>
                <span style={{ color: c.trend === 'up' ? G : R }}>
                  {c.trend === 'up' ? IC.up(10) : IC.down(10)}
                </span>
              </div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: 'var(--app-text-primary)' }}>{c.conv}</div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: 'var(--app-text-secondary)' }}>
                {kloelT(`R$`)} {c.cpc.toFixed(2)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => handleCampaignToggle(c)}
                  title={c.status === 'active' ? 'Pausar' : 'Ativar'}
                  style={{
                    background: 'none', border: 'none',
                    color: platformKey === 'meta' && metaAccessToken ? colors.text.muted : colors.text.dim,
                    cursor: platformKey === 'meta' && metaAccessToken ? 'pointer' : 'not-allowed',
                    padding: 2, display: 'flex',
                  }}
                >
                  {c.status === 'active' ? IC.pause(12) : IC.play(12)}
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(c.id)}
                  title={kloelT(`Copiar ID`)}
                  style={{ background: 'none', border: 'none', color: 'var(--app-text-secondary)', cursor: 'pointer', padding: 2, display: 'flex' }}
                >
                  {IC.dup(12)}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: '32px 16px', textAlign: 'center' as const }}>
            <div style={{ fontSize: 12, fontFamily: SORA, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Nenhuma campanha sincronizada. Conecte`)} {platform.name}{' '}
              {kloelT(`para importar campanhas.`)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
