'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { useRef, useEffect, useState } from 'react';

export const SORA = "'Sora', sans-serif";
export const MONO = "'JetBrains Mono', monospace";
export const EMBER = colors.ember.primary;
export const G = '#10B981';
export const R = '#EF4444';

function svg(w: number, h: number, d: string, opts: { stroke?: boolean; fill?: boolean } = {}) {
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill={opts.fill === false ? 'none' : 'currentColor'}
      stroke={opts.stroke ? 'currentColor' : 'none'}
      strokeWidth={opts.stroke ? 2 : undefined}
      aria-hidden="true"
    >
      <path d={kloelT(d)} />
    </svg>
  );
}

function svgMulti(w: number, h: number, children: React.ReactNode, stroke = false) {
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 2 : undefined}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IC: Record<string, (s: number) => React.ReactElement> = {
  meta: (s) =>
    svg(s, s, `M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`),
  gads: (s) =>
    svg(s, s, `M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm5.2 17.6H6.8L12 6.4l5.2 11.2z`),
  tads: (s) =>
    svg(s, s, `M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z`),
  zap: (s) => svg(s, s, `M13 2L3 14h9l-1 8 10-12h-9l1-8z`),
  pause: (s) =>
    svgMulti(s, s, <>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </>),
  play: (s) => svg(s, s, `M8 5v14l11-7z`),
  dup: (s) =>
    svgMulti(s, s, <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d={kloelT(`M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1`)} />
    </>, true),
  up: (s) => svg(s, s, `M12 4l-8 8h5v8h6v-8h5z`),
  down: (s) => svg(s, s, `M12 20l8-8h-5V4H9v8H4z`),
  search: (s) =>
    svgMulti(
      s, s,
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>,
      true,
    ),
  link: (s) =>
    svgMulti(
      s, s,
      <>
        <path d={kloelT(`M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71`)} />
        <path d={kloelT(`M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71`)} />
      </>,
      true,
    ),
  shield: (s) =>
    svgMulti(
      s, s,
      <path d={kloelT(`M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z`)} />,
      true,
    ),
};

export function Fmt(v: number): string {
  return v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1000
      ? `${(v / 1000).toFixed(1)}K`
      : v.toString();
}

export function FmtMoney(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export function roasColor(r: number): string {
  if (r > 4) return G;
  if (r > 2) return colors.text.silver;
  if (r > 1.5) return '#F59E0B';
  return R;
}

export function fiberColor(r: number): string {
  if (r > 10) return G;
  if (r > 3) return colors.text.silver;
  if (r > 1.5) return '#F59E0B';
  return R;
}

export function NP({
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
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

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
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      frame += 1;
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

export function Ticker({ value, prefix = '' }: { value: number; prefix?: string }) {
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
      step += 1;
      const ease = 1 - (1 - step / steps) ** 3;
      setDisplay(current + diff * ease);
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
