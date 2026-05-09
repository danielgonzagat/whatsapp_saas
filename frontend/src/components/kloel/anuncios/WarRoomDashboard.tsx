'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';
import { secureRandomFloat } from '@/lib/secure-random';
import { AdAccountsBoard } from './AdAccountsBoard';
import { CampaignTimeline } from './CampaignTimeline';
import { InvestReturnPanel } from './InvestReturnPanel';
import { IC, Ticker, Fmt, roasColor, EMBER, G, SORA, MONO } from './AnunciosShared';
import type { AdRule } from './anuncios-types';
import type { Campaign, PlatformKey, PlatformData } from './anuncios-types';

const R = '#EF4444';

export function WarRoomDashboard({
  platforms,
  campaigns,
  onGoToRules,
  onConnectMeta,
  onToggleCampaign,
  metaAccessToken,
}: {
  platforms: Record<PlatformKey, PlatformData>;
  campaigns: Campaign[];
  onGoToRules: () => void;
  onConnectMeta: () => void;
  onToggleCampaign: (campaign: Campaign) => void;
  metaAccessToken?: string;
}) {
  const { data: rulesData } = useSWR<Record<string, unknown>[]>('/ad-rules', swrFetcher, {
    keepPreviousData: true,
  });
  const adRules: AdRule[] = (rulesData || []).map((r: Record<string, unknown>) => ({
    id: typeof r.id === 'string' ? r.id : `rule-${secureRandomFloat().toString(36).slice(2, 10)}`,
    condition: typeof r.condition === 'string' ? r.condition : 'condição não informada',
    action: typeof r.action === 'string' ? r.action : 'ação não informada',
    active: typeof r.active === 'boolean' ? r.active : true,
    fires: typeof r.fireCount === 'number' ? r.fireCount : 0,
  }));

  const totalSpend = platforms.meta.spend + platforms.google.spend + platforms.tiktok.spend;
  const totalRev = platforms.meta.revenue + platforms.google.revenue + platforms.tiktok.revenue;
  const profit = totalRev - totalSpend;
  const totalConv = platforms.meta.conversions + platforms.google.conversions + platforms.tiktok.conversions;
  const totalRoas = totalSpend > 0 ? totalRev / totalSpend : 0;
  const hasData = totalSpend > 0;
  const { isMobile } = useResponsiveViewport();

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, animation: 'fadeIn .3s ease' }}>
      <div style={{ textAlign: 'center' as const, padding: isMobile ? '18px 0 4px' : '24px 0 8px' }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 2, marginBottom: 8 }}>
          {kloelT(`LUCRO LIQUIDO`)}
        </div>
        {hasData ? (
          <div style={{ fontSize: isMobile ? 46 : 88, fontWeight: 800, fontFamily: MONO, color: G, textShadow: `0 0 40px ${G}44, 0 0 80px ${G}22`, lineHeight: 1 }}>
            <Ticker value={profit} prefix="" />
          </div>
        ) : (
          <div style={{ fontSize: 48, fontWeight: 800, fontFamily: MONO, color: 'var(--app-text-tertiary)', lineHeight: 1 }}>
            {kloelT(`&mdash;`)}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr',
          gap: 16,
          alignItems: 'center',
        }}
      >
        <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: 20, textAlign: 'center' as const }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 6 }}>
            INVESTIDO
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: MONO, color: hasData ? R : colors.text.dim }}>
            {hasData ? <Ticker value={totalSpend} /> : '\u2014'}
          </div>
        </div>
        {!isMobile && <div style={{ fontSize: 28, color: 'var(--app-text-tertiary)' }}>{kloelT(`&rarr;`)}</div>}
        <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: 20, textAlign: 'center' as const }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 6 }}>
            RETORNO
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: MONO, color: hasData ? G : colors.text.dim }}>
            {hasData ? <Ticker value={totalRev} /> : '\u2014'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'ROAS', value: hasData ? `${totalRoas.toFixed(2)}x` : '\u2014', color: hasData ? roasColor(totalRoas) : colors.text.dim },
          { label: 'CONVERSOES', value: hasData ? Fmt(totalConv) : '\u2014', color: hasData ? EMBER : colors.text.dim },
          { label: 'CAMPANHAS', value: String(campaigns.length), color: campaigns.length > 0 ? colors.text.silver : colors.text.dim },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: MONO, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <AdAccountsBoard platforms={platforms} onConnectMeta={onConnectMeta} />

      <CampaignTimeline
        campaigns={campaigns}
        platforms={platforms}
        onToggleCampaign={onToggleCampaign}
        hasAccessToken={Boolean(metaAccessToken)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, marginBottom: 12 }}>
            {kloelT(`REGRAS IA ATIVAS`)}
          </div>
          {adRules.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {adRules.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, opacity: r.active ? 1 : 0.5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.active ? EMBER : colors.text.dim, marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-primary)', lineHeight: 1.4 }}>
                      IF {r.condition}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: EMBER, marginTop: 2 }}>
                      {kloelT(`&rarr;`)} {r.action}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: 'var(--app-text-tertiary)', marginTop: 2 }}>
                      {r.fires} execucoes
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, fontFamily: SORA, color: 'var(--app-text-tertiary)', textAlign: 'center' as const, padding: '24px 0', lineHeight: 1.6 }}>
              {kloelT(`Nenhuma regra IA criada. Vá para a aba Regras IA para criar automacoes.`)}
            </div>
          )}
        </div>

        <InvestReturnPanel platforms={platforms} hasData={hasData} keywords={[]} />
      </div>

      <button
        type="button"
        onClick={onGoToRules}
        style={{
          background: 'transparent', border: `1px dashed ${EMBER}66`, borderRadius: 6, padding: 20,
          color: EMBER, fontSize: 14, fontFamily: SORA, fontWeight: 600, cursor: 'pointer',
          transition: 'border-color 150ms ease, color 150ms ease', textAlign: 'center' as const,
        }}
      >
        {kloelT(`+ Criar primeira regra de automacao`)}
      </button>
    </div>
  );
}
