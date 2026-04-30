'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
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
const EMBER = colors.ember.primary;
const G = '#10B981'; /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */
const R = '#EF4444'; /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */

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
const roasColor = (r: number) =>
  r > 4
    ? G
    : r > 2
      ? colors.text.silver
      : r > 1.5
        ? '#F59E0B' /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */
        : R;
const fiberColor = (r: number) =>
  r > 10
    ? G
    : r > 3
      ? colors.text.silver
      : r > 1.5
        ? '#F59E0B' /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */
        : R;

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
      ctx.strokeStyle = colors.text.dim;
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
        borderBottom: '1px solid colors.border.space',
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
              color: active ? t.activeColor : colors.text.muted,
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
