'use client';

import { kloelT } from '@/lib/i18n/t';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { apiFetch } from '@/lib/api';
import { metaAdsApi } from '@/lib/api/meta';
import { swrFetcher } from '@/lib/fetcher';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type React from 'react';
import { startTransition, useEffect, useRef, useState, useId } from 'react';
import useSWR, { mutate } from 'swr';
import { secureRandomFloat } from '@/lib/secure-random';
import {
  emptyPlatformMetrics,
  extractMetaCampaignsFromResponse,
  extractMetaPlatformMetrics,
  mapMetaCampaign,
} from './AnunciosView.helpers';

// ── Fonts ──
const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";

// ── DNA Colors ──
const EMBER = '#E85D30';
const G = '#10B981';
const R = '#EF4444';

// ── Icons ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  meta: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`,
        )}
      />
    </svg>
  ),
  gads: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm5.2 17.6H6.8L12 6.4l5.2 11.2z`,
        )}
      />
    </svg>
  ),
  tads: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z`,
        )}
      />
    </svg>
  ),
  zap: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M13 2L3 14h9l-1 8 10-12h-9l1-8z`)} />
    </svg>
  ),
  pause: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  ),
  play: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M8 5v14l11-7z`)} />
    </svg>
  ),
  dup: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d={kloelT(`M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1`)} />
    </svg>
  ),
  up: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M12 4l-8 8h5v8h6v-8h5z`)} />
    </svg>
  ),
  down: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={kloelT(`M12 20l8-8h-5V4H9v8H4z`)} />
    </svg>
  ),
  search: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  link: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d={kloelT(`M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71`)} />
      <path d={kloelT(`M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71`)} />
    </svg>
  ),
  shield: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d={kloelT(`M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z`)} />
    </svg>
  ),
};

// ── Platform definitions (no data until accounts are connected) ──
type PlatformData = {
  name: string;
  color: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  connected: boolean;
};

// Mutable — overwritten by main component when Meta is connected
let PLATFORMS: Record<'meta' | 'google' | 'tiktok', PlatformData> = {
  meta: {
    name: 'Meta Ads',
    color: '#1877F2',
    spend: 0,
    revenue: 0,
    roas: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    connected: false,
  },
  google: {
    name: 'Google Ads',
    color: '#4285F4',
    spend: 0,
    revenue: 0,
    roas: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    connected: false,
  },
  tiktok: {
    name: 'TikTok Ads',
    color: '#FF0050',
    spend: 0,
    revenue: 0,
    roas: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    connected: false,
  },
};

// Campaigns — empty until ad accounts are connected, mutable
type Campaign = {
  id: string;
  platform: 'meta' | 'google' | 'tiktok';
  name: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
  conv: number;
  ctr: number;
  cpc: number;
  trend: 'up' | 'down';
};
let CAMPAIGNS: Campaign[] = [];

type Rule = { id: string; condition: string; action: string; active: boolean; fires: number };

// IA actions — empty until ad accounts are connected and rules are created

// Keywords — empty until ad accounts are connected
const TOP_KEYWORDS: { keyword: string; conv: number; cpc: number }[] = [];

// ── Helpers ──
function Fmt(v: number): string {
  return v >= 1000000
    ? `${(v / 1000000).toFixed(1)}M`
    : v >= 1000
      ? `${(v / 1000).toFixed(1)}K`
      : v.toString();
}
const FmtMoney = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const roasColor = (r: number) => (r > 4 ? G : r > 2 ? '#E0DDD8' : r > 1.5 ? '#F59E0B' : R);
const fiberColor = (r: number) => (r > 10 ? G : r > 3 ? '#E0DDD8' : r > 1.5 ? '#F59E0B' : R);

// ── NeuralPulse canvas — flat line when no data, animated only with real intensity ──
function NP({
  color,
  intensity = 1,
  width = 120,
  height = 20,
}: {
  color: string;
  intensity?: number;
  width?: number;
  height?: number;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    if (!c) {
      return;
    }
    const ctx = c.getContext('2d');
    if (!ctx) {
      return;
    }

    // No data: draw a single flat line and stop
    if (intensity <= 0) {
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.strokeStyle = '#3A3A3F';
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    let frame = 0;
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.12 + Math.sin(frame * 0.02 + i) * 0.08;
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 2) {
          const y =
            height / 2 +
            Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (height * 0.2 + i * 2) * intensity;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [width, height, color, intensity]);
  return (
    <canvas
      ref={cv}
      width={width}
      height={height}
      style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' as const }}
    />
  );
}

// ── Ticker (animated counter) ──
function Ticker({ value, prefix = '' }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(display);
  displayRef.current = display;
  useEffect(() => {
    const current = displayRef.current;
    const diff = value - current;
    if (Math.abs(diff) < 1) {
      setDisplay(value);
      return;
    }
    const steps = 30;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const ease = 1 - (1 - step / steps) ** 3;
      const next = current + diff * ease;
      setDisplay(next);
      if (step >= steps) {
        setDisplay(value);
        clearInterval(iv);
      }
    }, 33);
    return () => clearInterval(iv);
  }, [value]);
  return (
    <span>
      {prefix}
      {display >= 1000 ? FmtMoney(Math.round(display)) : display.toFixed(2)}
    </span>
  );
}

// ── Routes ──
const routes: Record<string, string> = {
  visao: '/anuncios',
  meta: '/anuncios/meta',
  google: '/anuncios/google',
  tiktok: '/anuncios/tiktok',
  track: '/anuncios/rastreamento',
  rules: '/anuncios/regras',
};

// ── Tab config ──
const TABS = [
  { id: 'visao', label: 'War Room', iconKey: 'zap', activeColor: EMBER },
  { id: 'meta', label: 'Meta Ads', iconKey: 'meta', activeColor: '#1877F2' },
  { id: 'google', label: 'Google Ads', iconKey: 'gads', activeColor: '#4285F4' },
  { id: 'tiktok', label: 'TikTok Ads', iconKey: 'tads', activeColor: '#FF0050' },
  { id: 'track', label: 'Rastreamento', iconKey: 'link', activeColor: EMBER },
  { id: 'rules', label: 'Regras IA', iconKey: 'shield', activeColor: EMBER },
];

function AnunciosTabBar({
  tab,
  isMobile,
  onSelect,
}: {
  tab: string;
  isMobile: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        borderBottom: '1px solid #222226',
        padding: isMobile ? '0 12px' : '0 16px',
        overflowX: 'auto' as const,
      }}
    >
      {TABS.map((t) => {
        const active = tab === t.id;
        const icon = IC[t.iconKey];
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: isMobile ? '10px 12px' : '10px 16px',
              border: 'none',
              background: 'none',
              color: active ? t.activeColor : '#6E6E73',
              borderBottom: active ? `2px solid ${t.activeColor}` : '2px solid transparent',
              cursor: 'pointer',
              fontSize: isMobile ? 12 : 13,
              fontFamily: SORA,
              whiteSpace: 'nowrap' as const,
              transition: 'color 150ms ease',
            }}
          >
            {icon(14)}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── WarRoom ──
function WarRoom({
  onGoToRules,
  onGoToTab: _onGoToTab,
  metaAccessToken,
}: {
  onGoToRules: () => void;
  onGoToTab: (id: string) => void;
  metaAccessToken?: string;
}) {
  const { data: rulesData } = useSWR<Record<string, unknown>[]>('/ad-rules', swrFetcher, {
    keepPreviousData: true,
  });
  const adRules = (rulesData || []).map((r: Record<string, unknown>) => ({
    id: typeof r.id === 'string' ? r.id : `rule-${secureRandomFloat().toString(36).slice(2, 10)}`,
    condition: typeof r.condition === 'string' ? r.condition : 'condição não informada',
    action: typeof r.action === 'string' ? r.action : 'ação não informada',
    active: typeof r.active === 'boolean' ? r.active : true,
    fires: typeof r.fireCount === 'number' ? r.fireCount : 0,
  }));

  const handleCampaignToggle = async (campaign: Campaign) => {
    if (!metaAccessToken) {
      return;
    }
    const newStatus = campaign.status === 'active' ? 'PAUSED' : 'ACTIVE';
    await metaAdsApi.updateCampaignStatus(campaign.id, newStatus, metaAccessToken);
    // Update local state optimistically
    CAMPAIGNS = CAMPAIGNS.map((c) =>
      c.id === campaign.id
        ? { ...c, status: newStatus.toLowerCase() === 'active' ? 'active' : 'paused' }
        : c,
    );
  };

  const totalSpend = PLATFORMS.meta.spend + PLATFORMS.google.spend + PLATFORMS.tiktok.spend;
  const totalRev = PLATFORMS.meta.revenue + PLATFORMS.google.revenue + PLATFORMS.tiktok.revenue;
  const profit = totalRev - totalSpend;
  const totalConv =
    PLATFORMS.meta.conversions + PLATFORMS.google.conversions + PLATFORMS.tiktok.conversions;
  const totalRoas = totalSpend > 0 ? totalRev / totalSpend : 0;
  const hasData = totalSpend > 0;
  const { isMobile } = useResponsiveViewport();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 20,
        animation: 'fadeIn .3s ease',
      }}
    >
      {/* P&L Hero — LUCRO LIQUIDO */}
      <div
        style={{ textAlign: 'center' as const, padding: isMobile ? '18px 0 4px' : '24px 0 8px' }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: MONO,
            color: 'var(--app-text-secondary)',
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          {kloelT(`LUCRO LIQUIDO`)}
        </div>
        {hasData ? (
          <div
            style={{
              fontSize: isMobile ? 46 : 88,
              fontWeight: 800,
              fontFamily: MONO,
              color: G,
              textShadow: `0 0 40px ${G}44, 0 0 80px ${G}22`,
              lineHeight: 1,
            }}
          >
            <Ticker value={profit} prefix="" />
          </div>
        ) : (
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              fontFamily: MONO,
              color: 'var(--app-text-tertiary)',
              lineHeight: 1,
            }}
          >
            {kloelT(`&mdash;`)}
          </div>
        )}
      </div>

      {/* INVESTIDO → RETORNO */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr',
          gap: 16,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 20,
            textAlign: 'center' as const,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: MONO,
              color: 'var(--app-text-secondary)',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            INVESTIDO
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              fontFamily: MONO,
              color: hasData ? R : '#3A3A3F',
            }}
          >
            {hasData ? <Ticker value={totalSpend} /> : '\u2014'}
          </div>
        </div>
        {!isMobile && (
          <div style={{ fontSize: 28, color: 'var(--app-text-tertiary)' }}>{kloelT(`&rarr;`)}</div>
        )}
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 20,
            textAlign: 'center' as const,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontFamily: MONO,
              color: 'var(--app-text-secondary)',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            RETORNO
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              fontFamily: MONO,
              color: hasData ? G : '#3A3A3F',
            }}
          >
            {hasData ? <Ticker value={totalRev} /> : '\u2014'}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {[
          {
            label: 'ROAS',
            value: hasData ? `${totalRoas.toFixed(2)}x` : '\u2014',
            color: hasData ? roasColor(totalRoas) : '#3A3A3F',
          },
          {
            label: 'CONVERSOES',
            value: hasData ? Fmt(totalConv) : '\u2014',
            color: hasData ? EMBER : '#3A3A3F',
          },
          {
            label: 'CAMPANHAS',
            value: String(CAMPAIGNS.length),
            color: CAMPAIGNS.length > 0 ? '#E0DDD8' : '#3A3A3F',
          },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: 'center' as const }}>
            <div
              style={{
                fontSize: 11,
                fontFamily: MONO,
                color: 'var(--app-text-secondary)',
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: MONO, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Platform vital signs — connect accounts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        {(Object.keys(PLATFORMS) as Array<keyof typeof PLATFORMS>).map((key) => {
          const p = PLATFORMS[key];
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
              <div style={{ height: 2, background: p.connected ? p.color : '#3A3A3F' }} />
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
                      background: p.connected ? G : '#3A3A3F',
                      flexShrink: 0,
                    }}
                  />
                </div>
                {p.connected ? (
                  <>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontFamily: MONO,
                            color: 'var(--app-text-secondary)',
                          }}
                        >
                          SPEND
                        </div>
                        <div style={{ fontSize: 16, fontFamily: MONO, color: R, fontWeight: 600 }}>
                          {FmtMoney(p.spend)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' as const }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontFamily: MONO,
                            color: 'var(--app-text-secondary)',
                          }}
                        >
                          REV
                        </div>
                        <div style={{ fontSize: 16, fontFamily: MONO, color: G, fontWeight: 600 }}>
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
                        style={{
                          fontSize: 18,
                          fontFamily: MONO,
                          fontWeight: 700,
                          color: roasColor(p.roas),
                        }}
                      >
                        {p.roas.toFixed(2)}x
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: G,
                            animation: 'pulse 2s infinite',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: MONO,
                            color: 'var(--app-text-secondary)',
                          }}
                        >
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
                          <div
                            style={{
                              fontSize: 10,
                              fontFamily: MONO,
                              color: 'var(--app-text-tertiary)',
                            }}
                          >
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
                    <NP color={'#3A3A3F'} intensity={0} width={200} height={28} />
                    <button
                      type="button"
                      onClick={() => {
                        if (key === 'meta') {
                          window.location.href = '/conta';
                        }
                      }}
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

      {/* Campaign nerve fibers — sorted by ROAS */}
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
        {CAMPAIGNS.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {[...CAMPAIGNS]
              .sort((a, b) => b.roas - a.roas)
              .map((c) => {
                const pIcon =
                  c.platform === 'meta' ? IC.meta : c.platform === 'google' ? IC.gads : IC.tads;
                const pColor = PLATFORMS[c.platform].color;
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
                      onClick={() => handleCampaignToggle(c)}
                      title={c.status === 'active' ? 'Pausar campanha' : 'Ativar campanha'}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: metaAccessToken ? '#6E6E73' : '#3A3A3F',
                        cursor: metaAccessToken ? 'pointer' : 'not-allowed',
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

      {/* IA decisions + invest bars + keywords — 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* IA Decisoes — shows actual ad rules from backend */}
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
            {kloelT(`REGRAS IA ATIVAS`)}
          </div>
          {adRules.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {adRules.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    opacity: r.active ? 1 : 0.5,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: r.active ? EMBER : '#3A3A3F',
                      marginTop: 5,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: MONO,
                        color: 'var(--app-text-primary)',
                        lineHeight: 1.4,
                      }}
                    >
                      IF {r.condition}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: EMBER, marginTop: 2 }}>
                      {kloelT(`&rarr;`)} {r.action}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: MONO,
                        color: 'var(--app-text-tertiary)',
                        marginTop: 2,
                      }}
                    >
                      {r.fires} execucoes
                    </div>
                  </div>
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
                padding: '24px 0',
                lineHeight: 1.6,
              }}
            >
              {kloelT(`Nenhuma regra IA criada. Vá para a aba Regras IA para criar automacoes.`)}
            </div>
          )}
        </div>

        {/* Right column: Investimento vs Retorno bars + Keywords */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {/* Investimento vs Retorno dual bars */}
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
              (Object.keys(PLATFORMS) as Array<keyof typeof PLATFORMS>).map((key) => {
                const p = PLATFORMS[key];
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

          {/* Keywords que mais convertem */}
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
            {TOP_KEYWORDS.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                {TOP_KEYWORDS.map((kw) => (
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
      </div>

      {/* Criar primeira regra CTA */}
      <button
        type="button"
        onClick={onGoToRules}
        style={{
          background: 'transparent',
          border: `1px dashed ${EMBER}66`,
          borderRadius: 6,
          padding: 20,
          color: EMBER,
          fontSize: 14,
          fontFamily: SORA,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'border-color 150ms ease, color 150ms ease',
          textAlign: 'center' as const,
        }}
      >
        {kloelT(`+ Criar primeira regra de automacao`)}
      </button>
    </div>
  );
}

// ── PlatformTab ──
function PlatformTab({
  platformKey,
  metaAccessToken,
}: {
  platformKey: string;
  metaAccessToken?: string;
}) {
  const p = PLATFORMS[platformKey as keyof typeof PLATFORMS];
  if (!p) {
    return null;
  }
  const isConnected = p.connected;
  const profit = p.revenue - p.spend;
  const profitColor = profit >= 0 ? G : R;
  const camps = CAMPAIGNS.filter((c) => c.platform === platformKey);

  const handleCampaignToggle = async (c: Campaign) => {
    if (platformKey !== 'meta' || !metaAccessToken) {
      return;
    }
    const newStatus = c.status === 'active' ? 'PAUSED' : 'ACTIVE';
    await metaAdsApi.updateCampaignStatus(c.id, newStatus, metaAccessToken);
    CAMPAIGNS = CAMPAIGNS.map((x) =>
      x.id === c.id
        ? { ...x, status: newStatus.toLowerCase() === 'active' ? 'active' : 'paused' }
        : x,
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 20,
        animation: 'fadeIn .3s ease',
      }}
    >
      {/* Profit hero or connect prompt */}
      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div
          style={{
            fontSize: 11,
            fontFamily: MONO,
            color: 'var(--app-text-secondary)',
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          LUCRO {p.name.toUpperCase()}
        </div>
        {isConnected ? (
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              fontFamily: MONO,
              color: profitColor,
              textShadow: `0 0 30px ${profitColor}44`,
              lineHeight: 1,
            }}
          >
            {FmtMoney(profit)}
          </div>
        ) : (
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              fontFamily: MONO,
              color: 'var(--app-text-tertiary)',
              lineHeight: 1,
            }}
          >
            {kloelT(`&mdash;`)}
          </div>
        )}
      </div>

      {/* Connect CTA when not connected */}
      {!isConnected && (
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: `1px solid ${p.color}33`,
            borderRadius: 6,
            padding: 24,
            textAlign: 'center' as const,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontFamily: SORA,
              color: 'var(--app-text-primary)',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {kloelT(`Conecte sua conta`)} {p.name} {kloelT(`para ver metricas reais`)}
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: SORA,
              color: 'var(--app-text-secondary)',
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {kloelT(
              `Apos conectar, todas as metricas, campanhas e dados serao importados automaticamente.`,
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (platformKey === 'meta') {
                window.location.href = '/conta';
              }
            }}
            style={{
              padding: '10px 24px',
              background: p.color,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 13,
              fontFamily: SORA,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 150ms ease',
            }}
          >
            {kloelT(`Conectar`)} {p.name}
          </button>
        </div>
      )}

      {/* 6 metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {[
          {
            label: 'GASTO',
            value: isConnected ? FmtMoney(p.spend) : '\u2014',
            color: isConnected ? R : '#3A3A3F',
          },
          {
            label: 'RETORNO',
            value: isConnected ? FmtMoney(p.revenue) : '\u2014',
            color: isConnected ? G : '#3A3A3F',
          },
          {
            label: 'ROAS',
            value: isConnected ? `${p.roas.toFixed(2)}x` : '\u2014',
            color: isConnected ? roasColor(p.roas) : '#3A3A3F',
          },
          {
            label: 'CONV',
            value: isConnected ? String(p.conversions) : '\u2014',
            color: isConnected ? EMBER : '#3A3A3F',
          },
          {
            label: 'CTR',
            value: isConnected ? `${p.ctr.toFixed(2)}%` : '\u2014',
            color: isConnected ? '#E0DDD8' : '#3A3A3F',
          },
          {
            label: 'CPC',
            value: isConnected ? `R$ ${p.cpc.toFixed(2)}` : '\u2014',
            color: 'var(--app-text-secondary)',
          },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 14,
              textAlign: 'center' as const,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: MONO,
                color: 'var(--app-text-secondary)',
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              {m.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: m.color }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Campaign table with trend arrows */}
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden' as const,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 0.8fr 1fr 1fr 0.8fr 0.6fr 0.8fr 0.8fr',
            padding: '10px 16px',
            borderBottom: '1px solid #222226',
          }}
        >
          {['Campanha', 'Status', 'Gasto', 'Retorno', 'ROAS', 'Conv', 'CPC', 'Acoes'].map((h) => (
            <div
              key={h}
              style={{
                fontSize: 10,
                fontFamily: MONO,
                color: 'var(--app-text-tertiary)',
                letterSpacing: 1,
                textTransform: 'uppercase' as const,
              }}
            >
              {h}
            </div>
          ))}
        </div>
        {camps.length > 0 ? (
          camps.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 0.8fr 1fr 1fr 0.8fr 0.6fr 0.8fr 0.8fr',
                padding: '10px 16px',
                borderBottom: '1px solid var(--app-border-subtle)',
                alignItems: 'center',
                transition: 'background 150ms ease',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontFamily: SORA,
                  color: 'var(--app-text-primary)',
                  overflow: 'hidden' as const,
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {c.name}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: MONO,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: c.status === 'active' ? `${G}18` : '#3A3A3F18',
                    color: c.status === 'active' ? G : '#6E6E73',
                  }}
                >
                  {c.status === 'active' ? 'Ativo' : 'Pausado'}
                </span>
              </div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: R }}>{FmtMoney(c.spend)}</div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: G }}>{FmtMoney(c.revenue)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: MONO,
                    fontWeight: 600,
                    color: roasColor(c.roas),
                  }}
                >
                  {c.roas.toFixed(2)}x
                </span>
                <span style={{ color: c.trend === 'up' ? G : R }}>
                  {c.trend === 'up' ? IC.up(10) : IC.down(10)}
                </span>
              </div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: 'var(--app-text-primary)' }}>
                {c.conv}
              </div>
              <div style={{ fontSize: 12, fontFamily: MONO, color: 'var(--app-text-secondary)' }}>
                {kloelT(`R$`)} {c.cpc.toFixed(2)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => handleCampaignToggle(c)}
                  title={c.status === 'active' ? 'Pausar' : 'Ativar'}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: platformKey === 'meta' && metaAccessToken ? '#6E6E73' : '#3A3A3F',
                    cursor: platformKey === 'meta' && metaAccessToken ? 'pointer' : 'not-allowed',
                    padding: 2,
                    display: 'flex',
                  }}
                >
                  {c.status === 'active' ? IC.pause(12) : IC.play(12)}
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(c.id)}
                  title={kloelT(`Copiar ID`)}
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
            </div>
          ))
        ) : (
          <div style={{ padding: '32px 16px', textAlign: 'center' as const }}>
            <div style={{ fontSize: 12, fontFamily: SORA, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Nenhuma campanha sincronizada. Conecte`)} {p.name}{' '}
              {kloelT(`para importar campanhas.`)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TrackingTab ──
function TrackingTab({ focus }: { focus?: string }) {
  const router = useRouter();
  const focusedRetargeting = focus === 'retargeting';
  // No data until pixel is installed and integrations are connected
  const trackedSales = 0;
  const pixelFires = 0;
  const postbacks = 0;
  const utms = 0;
  const attribution = 0;

  const events: { name: string; fires: number }[] = [
    { name: 'PageView', fires: 0 },
    { name: 'AddToCart', fires: 0 },
    { name: 'InitiateCheckout', fires: 0 },
    { name: 'Purchase', fires: 0 },
  ];

  const integrations = [
    { name: 'Checkout Kloel', connected: true },
    { name: 'Meta Pixel', connected: false },
    { name: 'Google Tag', connected: false },
    { name: 'CRM Kloel', connected: true },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 20,
        animation: 'fadeIn .3s ease',
      }}
    >
      <div
        style={{
          background: focusedRetargeting ? 'rgba(232,93,48,.06)' : '#111113',
          border: focusedRetargeting ? `1px solid ${EMBER}33` : '1px solid #222226',
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap' as const,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontFamily: MONO,
                color: EMBER,
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              {kloelT(`RETARGETING INTELIGENTE`)}
            </div>
            <div
              style={{
                fontSize: 13,
                fontFamily: SORA,
                color: 'var(--app-text-primary)',
                fontWeight: 600,
              }}
            >
              {kloelT(`Feche o loop entre abandono, campanha e recuperação`)}
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: SORA,
                color: 'var(--app-text-secondary)',
                marginTop: 6,
                lineHeight: 1.6,
              }}
            >
              {kloelT(`Use rastreamento para captar o abandono, acionar follow-ups, abrir campanhas e medir o
              retorno em Analytics sem sair da trilha operacional do produto.`)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <button
              type="button"
              onClick={() => router.push('/analytics?tab=abandonos')}
              style={{
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                padding: '8px 14px',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Ver abandonos`)}
            </button>
            <button
              type="button"
              onClick={() => router.push('/marketing/email?mode=templates')}
              style={{
                background: 'transparent',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '8px 14px',
                color: 'var(--app-text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Recuperar por email`)}
            </button>
            <button
              type="button"
              onClick={() => router.push('/settings?section=billing')}
              style={{
                background: 'transparent',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '8px 14px',
                color: 'var(--app-text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Plano e cobranca`)}
            </button>
          </div>
        </div>
        {focusedRetargeting && (
          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
              gap: 10,
            }}
          >
            {[
              {
                label: 'Follow-ups',
                desc: 'Retome leads frios logo depois do abandono.',
                href: '/followups?source=retargeting',
              },
              {
                label: 'Flow',
                desc: 'Automatize a reentrada com cadencias e regras.',
                href: '/flow?source=retargeting&purpose=recovery',
              },
              {
                label: 'Inbox',
                desc: 'Assuma manualmente as conversas prioritarias.',
                href: '/inbox?source=retargeting',
              },
            ].map((item) => (
              <button
                type="button"
                key={item.label}
                onClick={() => router.push(item.href)}
                style={{
                  textAlign: 'left',
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  padding: '14px 16px',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: MONO,
                    color: EMBER,
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: SORA,
                    color: 'var(--app-text-secondary)',
                    lineHeight: 1.6,
                  }}
                >
                  {item.desc}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vendas rastreadas */}
      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div
          style={{
            fontSize: 11,
            fontFamily: MONO,
            color: 'var(--app-text-secondary)',
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          {kloelT(`VENDAS RASTREADAS`)}
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            fontFamily: MONO,
            color: EMBER,
            textShadow: `0 0 30px ${EMBER}44`,
            lineHeight: 1,
          }}
        >
          {trackedSales}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'PIXEL FIRES', value: Fmt(pixelFires), color: EMBER },
          { label: 'POSTBACKS', value: Fmt(postbacks), color: G },
          { label: 'UTMs', value: String(utms), color: 'var(--app-text-primary)' },
          { label: 'ATRIBUICAO', value: `${attribution}%`, color: G },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 14,
              textAlign: 'center' as const,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: MONO,
                color: 'var(--app-text-secondary)',
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 10,
        }}
      >
        {[
          {
            title: 'Abandono',
            desc: 'Leia os gargalos reais antes de montar a recuperação.',
            cta: 'Abrir Analytics',
            action: () => router.push('/analytics?tab=abandonos'),
          },
          {
            title: 'Campanhas',
            desc: 'Use o dado de rastreamento para reimpactar a audiência certa.',
            cta: 'Abrir campanhas',
            action: () => router.push('/campaigns'),
          },
          {
            title: 'Broadcast',
            desc: 'Acione mensagens e emails assim que o lead esfriar.',
            cta: 'Abrir marketing',
            action: () => router.push('/marketing/whatsapp?mode=broadcast'),
          },
          {
            title: 'Flow',
            desc: 'Automatize a retomada com a cadencia certa.',
            cta: 'Abrir flow',
            action: () => router.push('/flow?source=retargeting&purpose=recovery'),
          },
        ].map((card) => (
          <div
            key={card.title}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontFamily: MONO,
                color: EMBER,
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: SORA,
                color: 'var(--app-text-secondary)',
                lineHeight: 1.6,
                minHeight: 52,
              }}
            >
              {card.desc}
            </div>
            <button
              type="button"
              onClick={card.action}
              style={{
                marginTop: 14,
                background: 'transparent',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '8px 14px',
                color: 'var(--app-text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {card.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Pixel code snippet */}
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
          {kloelT(`PIXEL KLOEL — COPIE E COLE NO SEU SITE`)}
        </div>
        <div
          style={{
            background: 'var(--app-bg-primary)',
            borderRadius: 6,
            padding: 14,
            fontFamily: MONO,
            fontSize: 9,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.8,
            overflowX: 'auto' as const,
            whiteSpace: 'pre' as const,
            border: '1px solid var(--app-border-subtle)',
          }}
        >
          {`<script>
  !function(k,l,o,e,i){k.KloelPixel=i;k[i]=k[i]||function(){
  (k[i].q=k[i].q||[]).push(arguments)};k[i].l=1*new Date();
  var s=l.createElement('script'),f=l.getElementsByTagName('script')[0];
  s.async=1;s.src='https://px.kloel.com/kl.js';
  f.parentNode.insertBefore(s,f)}(window,document,0,0,'kl');
  kl('init','KL-SEU_ID_AQUI');
  kl('track','PageView');
</script>`}
        </div>
      </div>

      {/* Event fires */}
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
          {kloelT(`EVENTOS RASTREADOS`)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {events.map((e) => (
            <div
              key={e.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 10px',
                background: 'var(--app-bg-secondary)',
                borderRadius: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: G }} />
                <span style={{ fontSize: 12, fontFamily: MONO, color: 'var(--app-text-primary)' }}>
                  {e.name}
                </span>
              </div>
              <span style={{ fontSize: 14, fontFamily: MONO, color: EMBER, fontWeight: 600 }}>
                {Fmt(e.fires)} fires
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Postback integrations */}
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
          {kloelT(`POSTBACK INTEGRACOES`)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {integrations.map((ig) => (
            <div
              key={ig.name}
              style={{
                background: 'var(--app-bg-secondary)',
                borderRadius: 6,
                padding: 14,
                textAlign: 'center' as const,
                border: `1px solid ${ig.connected ? `${G}33` : '#222226'}`,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontFamily: SORA,
                  color: ig.connected ? '#E0DDD8' : '#3A3A3F',
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {ig.name}
              </div>
              <div style={{ fontSize: 10, fontFamily: MONO, color: ig.connected ? G : '#3A3A3F' }}>
                {ig.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp X1 Tracking */}
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#25D366' }}>{IC.zap(16)}</span>
          <div>
            <div
              style={{
                fontSize: 13,
                fontFamily: SORA,
                color: 'var(--app-text-primary)',
                fontWeight: 600,
              }}
            >
              {kloelT(`WhatsApp X1 Tracking`)}
            </div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-secondary)' }}>
              {kloelT(`Atribuicao de vendas via conversa`)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3A3A3F' }} />
          <span style={{ fontSize: 11, fontFamily: MONO, color: 'var(--app-text-tertiary)' }}>
            {kloelT(`NAO CONFIGURADO`)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── RulesTab — CONNECTED TO /ad-rules backend via SWR ──
function RulesTab() {
  const fid = useId();
  const { data: rulesData, mutate: mutateRules } = useSWR<Record<string, unknown>[]>(
    '/ad-rules',
    swrFetcher,
    {
      keepPreviousData: true,
    },
  );
  const rules: Rule[] = (rulesData || []).map((r: Record<string, unknown>) => ({
    id: typeof r.id === 'string' ? r.id : `rule-${secureRandomFloat().toString(36).slice(2, 10)}`,
    condition: typeof r.condition === 'string' ? r.condition : 'condição não informada',
    action: typeof r.action === 'string' ? r.action : 'ação não informada',
    active: typeof r.active === 'boolean' ? r.active : true,
    fires: typeof r.fireCount === 'number' ? r.fireCount : 0,
  }));
  const [showForm, setShowForm] = useState(false);
  const [newCondition, setNewCondition] = useState('');
  const [newAction, setNewAction] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCondition, setEditCondition] = useState('');
  const [editAction, setEditAction] = useState('');
  const formRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (scrollTimer.current) {
        clearTimeout(scrollTimer.current);
      }
    },
    [],
  );

  const activeCount = rules.filter((r) => r.active).length;
  const totalFires = rules.reduce((s, r) => s + r.fires, 0);

  const invalidateAdRules = () =>
    mutate((key: string) => typeof key === 'string' && key.startsWith('/ad-rules'));
  const toggleRule = async (id: string) => {
    await apiFetch(`/ad-rules/${id}/toggle`, { method: 'POST' });
    mutateRules();
    invalidateAdRules();
  };

  const deleteRule = async (id: string) => {
    await apiFetch(`/ad-rules/${id}`, { method: 'DELETE' });
    mutateRules();
    invalidateAdRules();
  };

  const startEdit = (r: Rule) => {
    setEditingId(r.id);
    setEditCondition(r.condition);
    setEditAction(r.action);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCondition('');
    setEditAction('');
  };

  const saveEdit = async (id: string) => {
    if (!editCondition.trim() || !editAction.trim()) {
      return;
    }
    await apiFetch(`/ad-rules/${id}`, {
      method: 'PUT',
      body: { condition: editCondition.trim(), action: editAction.trim() },
    });
    cancelEdit();
    mutateRules();
    invalidateAdRules();
  };

  const handleCreateRule = async () => {
    if (!newCondition.trim() || !newAction.trim()) {
      return;
    }
    await apiFetch('/ad-rules', {
      method: 'POST',
      body: {
        name: `Regra ${Date.now()}`,
        condition: newCondition.trim(),
        action: newAction.trim(),
      },
    });
    setNewCondition('');
    setNewAction('');
    setShowForm(false);
    mutateRules();
    invalidateAdRules();
  };

  const openForm = () => {
    setShowForm(true);
    if (scrollTimer.current) {
      clearTimeout(scrollTimer.current);
    }
    scrollTimer.current = setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      100,
    );
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--app-bg-secondary)',
    border: '1px solid #3A3A3F',
    borderRadius: 6,
    color: 'var(--app-text-primary)',
    fontSize: 13,
    fontFamily: MONO,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 20,
        animation: 'fadeIn .3s ease',
      }}
    >
      {/* Regras ativas hero */}
      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div
          style={{
            fontSize: 11,
            fontFamily: MONO,
            color: 'var(--app-text-secondary)',
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          {kloelT(`REGRAS ATIVAS`)}
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            fontFamily: MONO,
            color: rules.length > 0 ? EMBER : '#3A3A3F',
            textShadow: rules.length > 0 ? `0 0 30px ${EMBER}44` : 'none',
            lineHeight: 1,
          }}
        >
          {activeCount}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          {
            label: 'EXECUCOES HOJE',
            value: String(totalFires),
            color: totalFires > 0 ? EMBER : '#3A3A3F',
          },
          {
            label: 'TOTAL REGRAS',
            value: String(rules.length),
            color: rules.length > 0 ? G : '#3A3A3F',
          },
          {
            label: 'INATIVAS',
            value: String(rules.length - activeCount),
            color: 'var(--app-text-primary)',
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 14,
              textAlign: 'center' as const,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: MONO,
                color: 'var(--app-text-secondary)',
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Rules as nerve fibers with NP, fire count, toggle switch */}
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
          {kloelT(`REGRAS — FIBRAS NEURAIS`)}
        </div>
        {rules.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {rules.map((r) => (
              <div
                key={r.id}
                style={{
                  background: 'var(--app-bg-secondary)',
                  borderRadius: 6,
                  borderLeft: `3px solid ${r.active ? EMBER : '#3A3A3F'}`,
                  opacity: r.active ? 1 : 0.5,
                  transition: 'opacity 150ms ease',
                  overflow: 'hidden' as const,
                }}
              >
                {editingId === r.id ? (
                  <div
                    style={{
                      padding: '12px 12px',
                      display: 'flex',
                      flexDirection: 'column' as const,
                      gap: 8,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          fontSize: 9,
                          fontFamily: MONO,
                          color: 'var(--app-text-secondary)',
                          letterSpacing: 1,
                          display: 'block',
                          marginBottom: 4,
                        }}
                        htmlFor={`${fid}-cond-1`}
                      >
                        {kloelT(`CONDICAO (IF)`)}
                      </label>
                      <input
                        aria-label="Condicao da regra (IF)"
                        type="text"
                        value={editCondition}
                        onChange={(e) => setEditCondition(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          background: 'var(--app-bg-card)',
                          border: '1px solid #3A3A3F',
                          borderRadius: 6,
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: MONO,
                          outline: 'none',
                          boxSizing: 'border-box' as const,
                        }}
                        id={`${fid}-cond-1`}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: 9,
                          fontFamily: MONO,
                          color: 'var(--app-text-secondary)',
                          letterSpacing: 1,
                          display: 'block',
                          marginBottom: 4,
                        }}
                        htmlFor={`${fid}-acao-1`}
                      >
                        {kloelT(`ACAO (THEN)`)}
                      </label>
                      <input
                        aria-label="Acao da regra (THEN)"
                        type="text"
                        value={editAction}
                        onChange={(e) => setEditAction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            saveEdit(r.id);
                          }
                          if (e.key === 'Escape') {
                            cancelEdit();
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          background: 'var(--app-bg-card)',
                          border: '1px solid #3A3A3F',
                          borderRadius: 6,
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: MONO,
                          outline: 'none',
                          boxSizing: 'border-box' as const,
                        }}
                        id={`${fid}-acao-1`}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        style={{
                          background: 'none',
                          border: '1px solid #3A3A3F',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: 'var(--app-text-secondary)',
                          fontSize: 11,
                          fontFamily: SORA,
                          cursor: 'pointer',
                        }}
                      >
                        {kloelT(`Cancelar`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(r.id)}
                        disabled={!editCondition.trim() || !editAction.trim()}
                        style={{
                          background: EMBER,
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 14px',
                          color: '#fff',
                          fontSize: 11,
                          fontFamily: SORA,
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: editCondition.trim() && editAction.trim() ? 1 : 0.5,
                        }}
                      >
                        {kloelT(`Salvar`)}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: MONO,
                          color: 'var(--app-text-primary)',
                          marginBottom: 2,
                        }}
                      >
                        IF {r.condition}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: MONO, color: EMBER }}>
                        {kloelT(`&rarr;`)} {r.action}
                      </div>
                    </div>
                    <NP
                      color={r.active ? EMBER : '#3A3A3F'}
                      intensity={r.active ? 1.2 : 0.3}
                      width={80}
                      height={20}
                    />
                    <span
                      style={{
                        fontSize: 16,
                        fontFamily: MONO,
                        fontWeight: 700,
                        color: 'var(--app-text-primary)',
                        minWidth: 36,
                        textAlign: 'right' as const,
                      }}
                    >
                      {r.fires}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--app-text-secondary)',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                      }}
                      title={kloelT(`Editar regra`)}
                    >
                      {IC.dup(12)}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRule(r.id)}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        border: 'none',
                        background: r.active ? EMBER : '#3A3A3F',
                        cursor: 'pointer',
                        position: 'relative' as const,
                        transition: 'background 150ms ease',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={
                          {
                            position: 'absolute' as const,
                            top: 3,
                            left: r.active ? 19 : 3,
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: '#fff',
                            transition: 'left 150ms ease',
                          } as React.CSSProperties
                        }
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(r.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--app-text-secondary)',
                        cursor: 'pointer',
                        padding: 4,
                        fontSize: 14,
                        fontFamily: MONO,
                        transition: 'color 150ms ease',
                      }}
                      title={kloelT(`Remover regra`)}
                    >
                      {kloelT(`&times;`)}
                    </button>
                  </div>
                )}
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
              padding: '24px 0',
            }}
          >
            {kloelT(`Nenhuma regra criada. Crie sua primeira regra de automacao abaixo.`)}
          </div>
        )}
      </div>

      {/* Create rule form */}
      {showForm && (
        <div
          ref={formRef}
          style={{
            background: 'var(--app-bg-card)',
            border: `1px solid ${EMBER}44`,
            borderRadius: 6,
            padding: 20,
            animation: 'fadeIn .3s ease',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontFamily: SORA,
              color: 'var(--app-text-primary)',
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            {kloelT(`Nova Regra de Automacao`)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontFamily: MONO,
                  color: 'var(--app-text-secondary)',
                  letterSpacing: 1,
                  display: 'block',
                  marginBottom: 6,
                }}
                htmlFor={`${fid}-cond-2`}
              >
                {kloelT(`CONDICAO (IF)`)}
              </label>
              <input
                aria-label="Condicao da nova regra (IF)"
                type="text"
                value={newCondition}
                onChange={(e) => setNewCondition(e.target.value)}
                placeholder={kloelT(`Ex: ROAS < 1.0 por 48h`)}
                style={inputStyle}
                id={`${fid}-cond-2`}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontFamily: MONO,
                  color: 'var(--app-text-secondary)',
                  letterSpacing: 1,
                  display: 'block',
                  marginBottom: 6,
                }}
                htmlFor={`${fid}-acao-2`}
              >
                {kloelT(`ACAO (THEN)`)}
              </label>
              <input
                aria-label="Acao da nova regra (THEN)"
                type="text"
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                placeholder={kloelT(`Ex: Pausar campanha`)}
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateRule();
                  }
                }}
                id={`${fid}-acao-2`}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setNewCondition('');
                  setNewAction('');
                }}
                style={{
                  background: 'none',
                  border: '1px solid #3A3A3F',
                  borderRadius: 6,
                  padding: '8px 16px',
                  color: 'var(--app-text-secondary)',
                  fontSize: 12,
                  fontFamily: SORA,
                  cursor: 'pointer',
                }}
              >
                {kloelT(`Cancelar`)}
              </button>
              <button
                type="button"
                onClick={handleCreateRule}
                disabled={!newCondition.trim() || !newAction.trim()}
                style={{
                  background: EMBER,
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 20px',
                  color: '#fff',
                  fontSize: 12,
                  fontFamily: SORA,
                  fontWeight: 600,
                  cursor: newCondition.trim() && newAction.trim() ? 'pointer' : 'not-allowed',
                  opacity: newCondition.trim() && newAction.trim() ? 1 : 0.5,
                  transition: 'opacity 150ms ease',
                }}
              >
                {kloelT(`Criar Regra`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Criar nova regra button */}
      <button
        type="button"
        onClick={openForm}
        style={{
          background: 'transparent',
          border: `1px dashed ${showForm ? '#3A3A3F' : `${EMBER}66`}`,
          borderRadius: 6,
          padding: 16,
          color: showForm ? '#3A3A3F' : EMBER,
          fontSize: 13,
          fontFamily: SORA,
          cursor: showForm ? 'default' : 'pointer',
          transition: 'border-color 150ms ease, color 150ms ease',
          textAlign: 'center' as const,
          fontWeight: 600,
        }}
      >
        {kloelT(`+ Criar nova regra`)}
      </button>
    </div>
  );
}

// ── Main component ──
export default function AnunciosView({ defaultTab = 'visao' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(defaultTab);
  const requestedFocus = searchParams?.get('focus') || undefined;
  const prevDefault = useRef(defaultTab);
  useEffect(() => {
    if (prevDefault.current !== defaultTab) {
      setTab(defaultTab);
      prevDefault.current = defaultTab;
    }
  }, [defaultTab]);
  useEffect(() => {
    if (requestedFocus && tab !== 'track') {
      setTab('track');
    }
  }, [requestedFocus, tab]);

  // ── Meta connection & real ad data ──
  const { data: metaStatus } = useSWR<Record<string, unknown>>('/meta/auth/status', swrFetcher);
  const metaConnected = metaStatus?.connected === true;

  const { data: metaInsights } = useSWR<Record<string, unknown>>(
    metaConnected ? '/meta/ads/insights/account' : null,
    swrFetcher,
  );
  const { data: metaCampaigns } = useSWR<Record<string, unknown>>(
    metaConnected ? '/meta/ads/campaigns' : null,
    swrFetcher,
  );

  // Hydrate PLATFORMS.meta with real data when available
  useEffect(() => {
    const metaMetrics =
      metaConnected && metaInsights
        ? extractMetaPlatformMetrics(metaInsights as Record<string, unknown>)
        : emptyPlatformMetrics();
    PLATFORMS = {
      ...PLATFORMS,
      meta: { ...PLATFORMS.meta, ...metaMetrics },
    };
  }, [metaConnected, metaInsights]);

  // Hydrate CAMPAIGNS with real campaign data
  useEffect(() => {
    const raw = extractMetaCampaignsFromResponse(metaCampaigns);
    CAMPAIGNS = metaConnected && raw.length > 0 ? raw.map(mapMetaCampaign) : [];
  }, [metaConnected, metaCampaigns]);

  const metaAccessToken: string | undefined =
    typeof metaStatus?.accessToken === 'string'
      ? (metaStatus.accessToken as string)
      : typeof metaStatus?.token === 'string'
        ? (metaStatus.token as string)
        : undefined;

  const goToRules = () => {
    setTab('rules');
    const nextRoute = routes.rules || '/anuncios/regras';
    if (pathname === nextRoute) {
      return;
    }
    startTransition(() => {
      router.push(nextRoute);
    });
  };

  const goToTab = (id: string) => {
    setTab(id);
    const nextRoute = routes[id] || '/anuncios';
    if (pathname === nextRoute) {
      return;
    }
    startTransition(() => {
      router.push(nextRoute);
    });
  };

  return (
    <div style={{ fontFamily: SORA, color: 'var(--app-text-primary)', minHeight: '100vh' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Tab bar */}
      <AnunciosTabBar tab={tab} isMobile={isMobile} onSelect={goToTab} />

      {/* Content */}
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1240, margin: '0 auto' }}>
        {tab === 'visao' && (
          <WarRoom onGoToRules={goToRules} onGoToTab={goToTab} metaAccessToken={metaAccessToken} />
        )}
        {tab === 'meta' && <PlatformTab platformKey="meta" metaAccessToken={metaAccessToken} />}
        {tab === 'google' && <PlatformTab platformKey="google" />}
        {tab === 'tiktok' && <PlatformTab platformKey="tiktok" />}
        {tab === 'track' && <TrackingTab focus={requestedFocus} />}
        {tab === 'rules' && <RulesTab />}
      </div>
    </div>
  );
}
