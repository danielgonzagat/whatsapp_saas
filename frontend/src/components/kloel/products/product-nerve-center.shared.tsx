'use client';

import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';

/** Recursive JSON-safe record type — allows property access without `any` */
 
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

/** Safe string extractor for JSX value props on JSON records */
export function jv(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

/** Safe number extractor for JSON records */
export function jn(value: unknown): number {
  return Number(value) || 0;
}

export const S = "'Sora',sans-serif";
export const M = "'JetBrains Mono',monospace";
export const V = {
  void: KLOEL_THEME.bgPrimary,
  s: KLOEL_THEME.bgCard,
  e: KLOEL_THEME.bgSecondary,
  b: KLOEL_THEME.borderPrimary,
  em: KLOEL_THEME.accent,
  t: KLOEL_THEME.textPrimary,
  t2: KLOEL_THEME.textSecondary,
  t3: KLOEL_THEME.textTertiary,
  g: '#25D366',
  g2: '#10B981',
  p: '#8B5CF6',
  bl: '#3B82F6',
  y: '#F59E0B',
  r: '#EF4444',
  pk: '#EC4899',
} as const;

export const cs: React.CSSProperties = {
  background: V.s,
  border: `1px solid ${V.b}`,
  borderRadius: 6,
};

export const is: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: KLOEL_THEME.bgInput,
  border: `1px solid ${KLOEL_THEME.borderInput}`,
  borderRadius: 6,
  color: KLOEL_THEME.textPrimary,
  fontSize: 13,
  fontFamily: S,
  outline: 'none',
};

export const ls: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: V.t3,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
  fontFamily: S,
};

export const formatBrlCents = (value: number) =>
  (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function unwrapApiPayload<T = any>(response: any): T {
  if (response?.error) {
    throw new Error(response.error);
  }

  return (response?.data ?? response) as T;
}

export function NP({
  w = 120,
  h = 24,
  intensity = 1,
}: {
  w?: number;
  h?: number;
  intensity?: number;
}) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
  const cv = useRef<HTMLCanvasElement>(null);
  const staticWave = Array.from({ length: Math.max(2, Math.floor(w / 2)) }, (_, index) => {
    const x = (index / (Math.max(2, Math.floor(w / 2)) - 1)) * w;
    const amplitude = h * 0.2 * intensity;
    const y = h / 2 + Math.sin(index * 0.55) * amplitude;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    syncPreference();
    mediaQuery.addEventListener?.('change', syncPreference);
    return () => mediaQuery.removeEventListener?.('change', syncPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    c.width = w * 2;
    c.height = h * 2;
    ctx.scale(2, 2);
    let f = 0;
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      for (let x = 0; x < w; x += 1) {
        ctx.lineTo(
          x,
          h / 2 + Math.sin(x * 0.12 + f * 0.07) * Math.sin(x * 0.04 + f * 0.025) * 5 * intensity,
        );
      }
      ctx.strokeStyle = V.em;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      f += 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [h, intensity, prefersReducedMotion, w]);

  if (prefersReducedMotion) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: 'block' }}>
        <title>Decorative waveform</title>
        <polyline
          points={staticWave}
          fill="none"
          stroke={V.em}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </svg>
    );
  }

  return <canvas ref={cv} style={{ width: w, height: h, display: 'block' }} />;
}

export function Bg({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: '3px 10px',
        background: `${color}15`,
        border: `1px solid ${color}30`,
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        color,
        fontFamily: M,
      }}
    >
      {children}
    </span>
  );
}

export function Tg({
  label,
  checked,
  onChange,
  desc,
}: {
  label: string;
  checked: boolean;
  onChange?: (value: boolean) => void;
  desc?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: `1px solid ${V.b}08`,
      }}
    >
      <div>
        <span style={{ fontSize: 12, color: V.t2 }}>{label}</span>
        {desc ? (
          <span style={{ display: 'block', fontSize: 10, color: V.t3, marginTop: 2 }}>{desc}</span>
        ) : null}
      </div>
      <div
        onClick={onChange ? () => onChange(!checked) : undefined}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? V.g : V.b,
          cursor: 'pointer',
          position: 'relative',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: KLOEL_THEME.bgCard,
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            transition: 'left .2s',
          }}
        />
      </div>
    </div>
  );
}

export function Fd({
  label,
  value,
  full,
  children,
  onChange,
}: {
  label: string;
  value?: string | number;
  full?: boolean;
  children?: React.ReactNode;
  onChange?: (value: string) => void;
}) {
  return (
    <div style={{ flex: full ? '1 1 100%' : '1 1 45%', minWidth: 0, marginBottom: 14 }}>
      <span style={ls}>{label}</span>
      {children || (
        <input
          style={is}
          value={onChange !== undefined ? (value ?? '') : undefined}
          defaultValue={onChange === undefined ? value : undefined}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        />
      )}
    </div>
  );
}

export function Bt({
  primary,
  children,
  onClick,
  disabled,
  style,
}: {
  primary?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '8px 16px',
        background: primary ? V.em : 'transparent',
        border: primary ? 'none' : `1px solid ${V.b}`,
        borderRadius: 6,
        color: primary ? V.void : V.t2,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: S,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function IconActionButton({
  label,
  color,
  active,
  onClick,
  children,
}: {
  label: string;
  color: string;
  active?: boolean;
  onClick?: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const tooltipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isVisible = hovered || focused;
  const tone = active ? V.g : color;

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={isVisible ? tooltipId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => {
          void onClick?.();
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 8px',
          background: isVisible ? `${tone}14` : 'transparent',
          border: `1px solid ${isVisible ? `${tone}30` : 'transparent'}`,
          borderRadius: 6,
          color: tone,
          cursor: 'pointer',
          transition:
            'background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease',
          transform: isVisible ? 'translateY(-1px)' : 'translateY(0)',
        }}
      >
        {children}
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 'calc(100% + 10px)',
          transform: isVisible ? 'translate(-50%, 0)' : 'translate(-50%, 4px)',
          opacity: isVisible ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity .16s ease, transform .16s ease',
          zIndex: 30,
        }}
      >
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: V.void,
            border: `1px solid ${V.b}`,
            color: V.t,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: S,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            boxShadow: '0 14px 28px rgba(0,0,0,0.34)',
          }}
        >
          {label}
        </div>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '100%',
            width: 8,
            height: 8,
            background: V.void,
            borderRight: `1px solid ${V.b}`,
            borderBottom: `1px solid ${V.b}`,
            transform: 'translate(-50%, -55%) rotate(45deg)',
          }}
        />
      </div>
    </div>
  );
}

export function Dv() {
  return <div style={{ height: 1, background: V.b, margin: '16px 0' }} />;
}

export function SkeletonBlock({
  width = '100%',
  height = 12,
}: {
  width?: number | string;
  height?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        background: `linear-gradient(90deg, ${V.e} 0%, ${V.b} 50%, ${V.e} 100%)`,
        borderRadius: 999,
        opacity: 0.75,
      }}
    />
  );
}

export function PanelLoadingState({
  label,
  description,
  compact,
}: {
  label: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        ...cs,
        padding: compact ? 20 : 24,
        minHeight: compact ? 180 : 240,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center',
      }}
    >
      <NP w={compact ? 90 : 110} h={20} intensity={0.75} />
      <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>{label}</span>
      {description ? (
        <span style={{ fontSize: 11, color: V.t3, lineHeight: 1.6, maxWidth: 360 }}>
          {description}
        </span>
      ) : null}
    </div>
  );
}

export function TabBar({
  tabs,
  active,
  onSelect,
  small,
}: {
  tabs: { k: string; l: string }[];
  active: string;
  onSelect: (key: string) => void;
  small?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 1,
        borderBottom: `1px solid ${V.b}`,
        marginBottom: small ? 14 : 20,
        overflowX: 'auto',
      }}
    >
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.k}
          onClick={() => onSelect(tab.k)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: small ? '6px 12px' : '8px 14px',
            background: 'none',
            border: 'none',
            borderBottom: active === tab.k ? `2px solid ${V.em}` : '2px solid transparent',
            color: active === tab.k ? V.t : V.t2,
            fontSize: small ? 11 : 12,
            fontWeight: active === tab.k ? 600 : 400,
            cursor: 'pointer',
            fontFamily: S,
            whiteSpace: 'nowrap',
          }}
        >
          {tab.l}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { isMobile } = useResponsiveViewport();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 12 : 20,
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: V.s,
          border: `1px solid ${V.b}`,
          borderRadius: isMobile ? '18px 18px 0 0' : 10,
          padding: isMobile ? '20px 16px 24px' : '24px 28px',
          maxWidth: 560,
          width: '100%',
          maxHeight: isMobile ? '88vh' : '85vh',
          overflowY: 'auto',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: V.t, margin: 0, fontFamily: S }}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: V.t3,
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            <svg
              aria-hidden="true"
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
