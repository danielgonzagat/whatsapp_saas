import { useMemo } from 'react';
import type { OnboardingPalette } from './palette';

interface GlyphProps {
  /** 0 connect · 1 products · 2 arsenal · 3 voice · 4 awakened (spec §6). */
  step: number;
  /** Lit product points on the inner hexagon (0–6). */
  products?: number;
  /** Lit arsenal stars on the outer constellation (0–12). */
  arsenal?: number;
  C: OnboardingPalette;
}

/**
 * The Glyph — the central evolving composition (spec §6). Eight layers, all
 * always rendered; opacity / colour / animation change per step. Never
 * substituted by a generic icon.
 */
export function Glyph({ step, products = 0, arsenal = 0, C }: GlyphProps) {
  const productSlots = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return {
          x: 150 + Math.cos(a) * 56,
          y: 150 + Math.sin(a) * 56,
          on: i < products,
        };
      }),
    [products],
  );

  const arsenalSlots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
        return {
          x: 150 + Math.cos(a) * 110,
          y: 150 + Math.sin(a) * 110,
          on: i < arsenal,
        };
      }),
    [arsenal],
  );

  const alive = step >= 1;
  const orbiting = step >= 2;
  const armed = step >= 3;
  const calibrated = step >= 4;

  return (
    <div style={{ position: 'relative', width: 300, height: 300, margin: '0 auto' }}>
      <svg
        viewBox="0 0 300 300"
        width="300"
        height="300"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="kloelCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={C.ember} stopOpacity="0.45" />
            <stop offset="60%" stopColor={C.ember} stopOpacity="0.10" />
            <stop offset="100%" stopColor={C.ember} stopOpacity="0" />
          </radialGradient>
          <filter id="kloelSoft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {/* 1 · Flower of Life — sacred base */}
        <g
          opacity={C.flowerOpacity}
          stroke={C.faint}
          strokeWidth="0.55"
          fill="none"
        >
          <circle cx="150" cy="150" r="56" />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <circle
                key={i}
                cx={150 + Math.cos(a) * 56}
                cy={150 + Math.sin(a) * 56}
                r="56"
              />
            );
          })}
        </g>

        {/* 2 · Vitruvian axes */}
        <g
          stroke={alive ? C.dim : C.faint}
          strokeWidth="0.5"
          opacity={alive ? 0.65 : 0.4}
          style={{ transition: 'opacity 1s' }}
        >
          <line x1="150" y1="20" x2="150" y2="280" />
          <line x1="20" y1="150" x2="280" y2="150" />
          <circle cx="150" cy="150" r="130" fill="none" />
        </g>

        {/* 3 · Outer ring (the awakening) */}
        <circle
          cx="150"
          cy="150"
          r="110"
          fill="none"
          stroke={armed ? C.ember : C.hi}
          strokeWidth="0.75"
          strokeDasharray={armed ? '0' : '2 4'}
          opacity={armed ? 0.65 : 0.45}
          style={{ transition: 'all 1s ease' }}
        />

        {/* 4 · Inner orbit (products) */}
        <circle
          cx="150"
          cy="150"
          r="56"
          fill="none"
          stroke={orbiting ? C.ember : C.hi}
          strokeWidth="0.75"
          strokeDasharray={orbiting ? '0' : '2 4'}
          opacity={orbiting ? 0.55 : 0.4}
          style={{ transition: 'all 1s ease' }}
        />

        {/* 6 · Arsenal constellation (rendered before products so stars sit behind) */}
        {arsenalSlots.map((s, i) => (
          <g
            key={i}
            style={{ transition: 'opacity .8s ease', opacity: s.on ? 1 : 0 }}
          >
            <line
              x1="150"
              y1="150"
              x2={s.x}
              y2={s.y}
              stroke={C.ember}
              strokeWidth="0.4"
              opacity="0.25"
            />
            <circle cx={s.x} cy={s.y} r="1.4" fill={C.ember} />
            <circle
              cx={s.x}
              cy={s.y}
              r="3"
              fill={C.ember}
              opacity="0.25"
              filter="url(#kloelSoft)"
            />
          </g>
        ))}

        {/* 5 · Product hexagon */}
        {productSlots.map((p, i) => (
          <g
            key={i}
            style={{ transition: 'all .6s ease', opacity: p.on ? 1 : 0.15 }}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill={p.on ? C.ember : 'transparent'}
              stroke={p.on ? C.ember : C.hi}
              strokeWidth="0.75"
            />
            {p.on ? (
              <circle
                cx={p.x}
                cy={p.y}
                r="7"
                fill={C.ember}
                opacity="0.2"
                filter="url(#kloelSoft)"
              />
            ) : null}
          </g>
        ))}

        {/* 8 · Amber identity line — step 0 only */}
        <g style={{ transition: 'opacity 1s ease', opacity: step === 0 ? 1 : 0 }}>
          <line
            x1="20"
            y1="150"
            x2="120"
            y2="150"
            stroke={C.amber}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.7"
          />
          <circle cx="20" cy="150" r="3" fill={C.amber} />
        </g>

        {/* 7 · Core — the intelligence */}
        <circle
          cx="150"
          cy="150"
          r="32"
          fill={alive ? 'url(#kloelCoreGlow)' : 'transparent'}
        />
        <circle
          cx="150"
          cy="150"
          r={alive ? 14 : 10}
          fill={alive ? C.ember : 'transparent'}
          stroke={alive ? 'transparent' : C.dim}
          strokeWidth="1"
          style={{
            transition: 'all 1s ease',
            filter: calibrated ? `drop-shadow(0 0 12px ${C.ember})` : 'none',
            transformOrigin: '150px 150px',
            animation: alive
              ? `kloelCorePulse ${calibrated ? '1.6s' : '2.6s'} ease-in-out infinite`
              : 'none',
          }}
        />
        <circle
          cx="150"
          cy="150"
          r="3"
          fill={alive ? C.white : C.dim}
          opacity={alive ? 0.95 : 1}
          style={{ transition: 'all 1s ease' }}
        />
      </svg>
    </div>
  );
}
