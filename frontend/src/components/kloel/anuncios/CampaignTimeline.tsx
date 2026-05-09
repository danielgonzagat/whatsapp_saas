'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { IC, NP, roasColor, fiberColor, SORA, MONO } from './AnunciosShared';
import type { Campaign, PlatformKey, PlatformData } from './anuncios-types';

export function CampaignTimeline({
  campaigns,
  platforms,
  onToggleCampaign,
  hasAccessToken,
}: {
  campaigns: Campaign[];
  platforms: Record<PlatformKey, PlatformData>;
  onToggleCampaign: (campaign: Campaign) => void;
  hasAccessToken: boolean;
}) {
  return (
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
        {kloelT(`CAMPANHAS — FIBRAS NEURAIS`)}
      </div>
      {campaigns.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {[...campaigns]
            .sort((a, b) => b.roas - a.roas)
            .map((c) => {
              const pIcon =
                c.platform === 'meta' ? IC.meta : c.platform === 'google' ? IC.gads : IC.tads;
              const pColor = platforms[c.platform].color;
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'var(--app-bg-secondary)',
                    borderRadius: 6,
                    borderLeft: `3px solid ${fiberColor(c.roas)}`,
                  }}
                >
                  <span style={{ color: pColor, flexShrink: 0 }}>{pIcon(14)}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: SORA,
                      color: 'var(--app-text-primary)',
                      flex: 1,
                      overflow: 'hidden' as const,
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' as const,
                    }}
                  >
                    {c.name}
                  </span>
                  <NP color={fiberColor(c.roas)} intensity={c.roas / 4} width={80} height={20} />
                  <span
                    style={{
                      fontSize: 16,
                      fontFamily: MONO,
                      fontWeight: 700,
                      color: roasColor(c.roas),
                      minWidth: 52,
                      textAlign: 'right' as const,
                    }}
                  >
                    {c.roas.toFixed(2)}x
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: MONO,
                      color: 'var(--app-text-secondary)',
                      minWidth: 40,
                      textAlign: 'right' as const,
                    }}
                  >
                    {c.conv} conv
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleCampaign(c)}
                    title={c.status === 'active' ? 'Pausar campanha' : 'Ativar campanha'}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: hasAccessToken ? colors.text.muted : colors.text.dim,
                      cursor: hasAccessToken ? 'pointer' : 'not-allowed',
                      padding: 2,
                      display: 'flex',
                    }}
                  >
                    {c.status === 'active' ? IC.pause(12) : IC.play(12)}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(c.id)}
                    title={kloelT(`Copiar ID da campanha`)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--app-text-secondary)',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                    }}
                  >
                    {IC.dup(12)}
                  </button>
                </div>
              );
            })}
        </div>
      ) : (
        <div
          style={{
            fontSize: 12,
            fontFamily: SORA,
            color: 'var(--app-text-tertiary)',
            textAlign: 'center' as const,
            padding: '24px 0',
            lineHeight: 1.6,
          }}
        >
          {kloelT(`Nenhuma campanha sincronizada. Conecte uma plataforma de anuncios para importar
            campanhas automaticamente.`)}
        </div>
      )}
    </div>
  );
}
