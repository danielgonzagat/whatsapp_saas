'use client';

import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { secureRandomFloat } from '@/lib/secure-random';
import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { LiveFeedEvent } from './ProdutosView.types';

// ── Fonts ──
export const SORA = "'Sora',sans-serif";
export const MONO = "'JetBrains Mono',monospace";

// ── DNA Colors ──
export const BG_CARD = KLOEL_THEME.bgCard;
export const BG_ELEVATED = KLOEL_THEME.bgSecondary;
export const BORDER = KLOEL_THEME.borderPrimary;
export const EMBER = KLOEL_THEME.accent;
export const PURPLE = '#8B5CF6';
export const GREEN = EMBER;

// ── CSS Animations ──
export const ANIMATIONS = `
@keyframes glow {
  0%, 100% { opacity: 0.6; filter: blur(20px); }
  50% { opacity: 1; filter: blur(30px); }
}
@keyframes tickerScroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.4; }
}
@keyframes slideIn {
  0% { transform: translateY(12px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes fadeIn {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes glowText {
  0%, 100% { text-shadow: 0 0 20px rgba(232,93,48,0.3); }
  50% { text-shadow: 0 0 40px rgba(232,93,48,0.8), 0 0 80px rgba(232,93,48,0.4); }
}
`;

// ── Formatters ──
export const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const fmtBRL = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
export const fmtBRLCents = (n: number) => fmtBRL(n / 100);
export const timeAgo = (value?: string | null) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}min`;
  }
  if (diffMinutes < 1440) {
    return `${Math.floor(diffMinutes / 60)}h`;
  }
  return `${Math.floor(diffMinutes / 1440)}d`;
};

export function getProductPlanPriceSummary(product: {
  minPlanPriceInCents?: unknown;
  maxPlanPriceInCents?: unknown;
}) {
  const rawMin = Number(product.minPlanPriceInCents);
  const rawMax = Number(product.maxPlanPriceInCents);
  const hasMin = Number.isFinite(rawMin);
  const hasMax = Number.isFinite(rawMax);

  if (!hasMin || !hasMax) {
    return {
      hasPlanPricing: false,
      minPlanPriceInCents: null,
      maxPlanPriceInCents: null,
      priceLabel: 'Sem planos',
    };
  }

  const minPlanPriceInCents = Math.max(0, Math.round(Math.min(rawMin, rawMax)));
  const maxPlanPriceInCents = Math.max(0, Math.round(Math.max(rawMin, rawMax)));

  return {
    hasPlanPricing: true,
    minPlanPriceInCents,
    maxPlanPriceInCents,
    priceLabel:
      minPlanPriceInCents === maxPlanPriceInCents
        ? fmtBRLCents(minPlanPriceInCents)
        : `${fmtBRLCents(minPlanPriceInCents)} até ${fmtBRLCents(maxPlanPriceInCents)}`,
  };
}

// ── Style helpers ──
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: BG_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: 'var(--app-text-primary)',
  fontFamily: MONO,
  fontSize: 12,
  outline: 'none',
};
export const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
export const btnPrimary = (color: string): React.CSSProperties => ({
  padding: '8px 16px',
  background: color,
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontFamily: SORA,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
});
export const btnGhost: React.CSSProperties = {
  padding: '8px 16px',
  background: 'none',
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: 'var(--app-text-secondary)',
  fontFamily: SORA,
  fontSize: 12,
  cursor: 'pointer',
};
export const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
};
export const focusPrimaryInput = (element: HTMLInputElement | null) => {
  if (!element) {
    return;
  }
  requestAnimationFrame(() => {
    element.focus();
  });
};

// ── NeuralPulse (NP) — canvas 2D with sin() waves ──
export function NP({
  w = 160,
  h = 28,
  color = 'colors.ember.primary',
}: {
  w?: number;
  h?: number;
  color?: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion({ defaultValue: true });
  const ref = useRef<HTMLCanvasElement>(null);

  const staticWave = Array.from({ length: Math.max(2, Math.floor(w / 2)) }, (_, index) => {
    const x = (index / (Math.max(2, Math.floor(w / 2)) - 1)) * w;
    const amplitude = h * 0.18;
    const y = h / 2 + Math.sin(index * 0.55) * amplitude;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    const c = ref.current;
    if (!c) {
      return;
    }
    const ctx = c.getContext('2d');
    if (!ctx) {
      return;
    }
    let frame = 0;
    let raf: number;
    let visible = true;
    const obs = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0 },
    );
    obs.observe(c);
    const draw = () => {
      if (!visible) {
        return;
      }
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.15 + Math.sin(frame * 0.02 + i) * 0.1;
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 2) {
          const spike = secureRandomFloat() > 0.97 ? (secureRandomFloat() - 0.5) * h * 0.6 : 0;
          const y =
            h / 2 + Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (h * 0.25 + i * 2) + spike;
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
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [w, h, color, prefersReducedMotion]);

  if (prefersReducedMotion) {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden="true"
        style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }}
      >
        <polyline
          points={staticWave}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }}
    />
  );
}

// ── Ticker — scrolling horizontal text ──
export function Ticker({
  items,
  color = 'colors.ember.primary',
  duration = '22s',
}: {
  items: string[];
  color?: string;
  duration?: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion({ defaultValue: true });
  const text = items.join('  ///  ');
  return (
    <div
      style={{
        overflow: 'hidden',
        width: '100%',
        background: BG_CARD,
        borderTop: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        padding: '6px 0',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          animation: prefersReducedMotion ? 'none' : `tickerScroll ${duration} linear infinite`,
          fontFamily: MONO,
          fontSize: 11,
          color,
          opacity: 0.7,
          transform: prefersReducedMotion ? 'translateX(0)' : undefined,
        }}
      >
        {prefersReducedMotion ? text : `${text}\u00a0\u00a0\u00a0///\u00a0\u00a0\u00a0${text}`}
      </div>
    </div>
  );
}

// ── LiveFeed — small event list ──
export function LiveFeed({
  events,
  color = 'colors.ember.primary',
}: {
  events: LiveFeedEvent[];
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((ev) => (
        <div
          key={`${ev.text}-${ev.time}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            opacity: 1,
          }}
        >
          <NP w={24} h={12} color={color} />
          <span
            style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)', flex: 1 }}
          >
            {ev.text}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)' }}>
            {ev.time}
          </span>
        </div>
      ))}
    </div>
  );
}
