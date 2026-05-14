'use client';
import { colors } from '@/lib/design-tokens';
import type { GlitchState, ViewState } from './HeroLoop';

const E = colors.ember.primary;

const ts = {
  fontSize: 'clamp(18px,5vw,50px)',
  fontWeight: 800,
  fontFamily: "var(--font-sora), 'Sora', sans-serif",
  letterSpacing: '-.03em',
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
};

export function HeroLoopDisplay({
  gx,
  vis,
  resurrected,
}: {
  gx: GlitchState;
  vis: ViewState;
  resurrected: boolean;
}) {
  return (
    <div
      style={{
        transform: `translate(${gx.shk[0]}px,${gx.shk[1]}px)`,
        position: 'relative',
        zIndex: 2,
      }}
    >
      {gx.chr > 0 && (
        <>
          <div
            style={{
              ...ts,
              position: 'absolute',
              left: -gx.chr,
              top: 0,
              color: 'rgba(255,0,0,0.33)',
              zIndex: 1,
            }}
          >
            {gx.text}
          </div>
          <div
            style={{
              ...ts,
              position: 'absolute',
              left: gx.chr,
              top: 0,
              color: 'rgba(0,0,255,0.27)',
              zIndex: 1,
            }}
          >
            {gx.text}
          </div>
        </>
      )}
      {gx.slices.map((s) => (
        <div
          key={`slice-${s.off}-${s.top}`}
          style={{
            position: 'absolute',
            left: s.off,
            top: `${s.top}%`,
            height: s.h,
            width: '100%',
            overflow: 'hidden',
            zIndex: 5,
          }}
        >
          <div style={{ ...ts, color: colors.text.silver, transform: `translateY(-${s.top}%)` }}>
            {gx.text}
          </div>
        </div>
      ))}
      {vis.phase !== 'hidden' && !resurrected && (
        <div style={{ position: 'relative', display: 'inline' }}>
          <span style={{ ...ts, color: colors.text.silver }}>{vis.text}</span>
          <span style={{ ...ts, color: colors.text.silver }}>{vis.suffix}</span>
          {vis.phase === 'typing' && (
            <span style={{ ...ts, color: E, animation: 'blink 1s ease infinite', marginLeft: 2 }}>
              |
            </span>
          )}
        </div>
      )}
      {gx.on && vis.phase === 'hidden' && !resurrected && (
        <span style={{ ...ts, color: colors.text.silver }}>{gx.text}</span>
      )}
      {gx.on && vis.phase !== 'hidden' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 6,
          }}
        >
          <span style={{ ...ts, color: colors.text.silver }}>{gx.text}</span>
        </div>
      )}
      {resurrected && !gx.on && (
        <span style={{ ...ts, color: E, transition: 'opacity .4s' }}>O Marketing Artificial começou.</span>
      )}
    </div>
  );
}

export function HeroLoopReducedMotion() {
  return (
    <div
      style={{
        position: 'relative',
        textAlign: 'center',
        minHeight: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ ...ts, color: E }}>O Marketing Artificial começou.</div>
    </div>
  );
}

export function HeroLoopFlash({ gxFlash }: { gxFlash: boolean }) {
  if (!gxFlash) {
    return null;
  }
  return (
    <div
      style={{
        position: 'absolute',
        inset: -40,
        background: E,
        zIndex: 4,
        opacity: 0.25,
        pointerEvents: 'none',
      }}
    />
  );
}
