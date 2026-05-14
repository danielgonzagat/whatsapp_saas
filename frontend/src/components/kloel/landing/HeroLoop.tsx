'use client';
import { useEffect, useRef, useState } from 'react';
import { colors } from '@/lib/design-tokens';
import { secureRandomFloat } from '@/lib/secure-random';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { runSequentialRange } from './KloelLanding.helpers';
const F = "var(--font-sora), 'Sora', sans-serif";
const E = colors.ember.primary;
const GC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&!?<>{}|/\\~';
const rc = () => GC[Math.floor(secureRandomFloat() * GC.length)];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HERO_LOOP_PRIMARY = 'O Marketing Digital';
const HERO_LOOP_DEATH_SUFFIX = ' acabou.';
const HERO_LOOP_RESURRECTED = 'O Marketing Artificial começou.';
type HeroLoopPhase = 'idle' | 'typing' | 'strike' | 'death' | 'hidden';
type ViewState = {
  text: string;
  strike: number;
  suffix: string;
  phase: HeroLoopPhase;
};
type GlitchSlice = {
  top: number;
  h: number;
  off: number;
};
type GlitchState = {
  on: boolean;
  text: string;
  shk: [number, number];
  chr: number;
  slices: GlitchSlice[];
  flash: boolean;
};
function scrambleText(src: string, chaos: number) {
  return src
    .split('')
    .map((c) => (c === ' ' ? ' ' : secureRandomFloat() < chaos ? rc() : c))
    .join('');
}
function buildGlitchSlices(): GlitchSlice[] {
  return Array.from({ length: 5 }, () => ({
    top: secureRandomFloat() * 100,
    h: 2 + secureRandomFloat() * 14,
    off: (secureRandomFloat() - 0.5) * 28,
  }));
}
export function HeroLoop() {
  const [vis, setVis] = useState<ViewState>({
    text: '',
    strike: 0,
    suffix: '',
    phase: 'idle',
  });
  const [gx, setGx] = useState<GlitchState>({
    on: false,
    text: '',
    shk: [0, 0],
    chr: 0,
    slices: [],
    flash: false,
  });
  const [resurrected, setResurrected] = useState(false);
  const noiseRef = useRef<HTMLCanvasElement | null>(null);
  const gxRef = useRef<boolean>(false);
  const m = useRef<boolean>(true);
  const prefersReducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    gxRef.current = gx.on;
  }, [gx.on, prefersReducedMotion]);
  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    const cv = noiseRef.current;
    if (!cv) {
      return;
    }
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return;
    }
    cv.width = 600;
    cv.height = 120;
    let raf2: number;
    const drawN = () => {
      if (!gxRef.current) {
        ctx.clearRect(0, 0, 600, 120);
        raf2 = requestAnimationFrame(drawN);
        return;
      }
      const img = ctx.createImageData(600, 120);
      for (let i = 0; i < img.data.length; i += 4) {
        const v2 = secureRandomFloat() * 255;
        img.data[i] = v2;
        img.data[i + 1] = v2;
        img.data[i + 2] = v2;
        img.data[i + 3] = secureRandomFloat() * 30;
      }
      ctx.putImageData(img, 0, 0);
      for (let y = 0; y < 120; y += 3) {
        ctx.fillStyle = `rgba(0,0,0,${0.1 + secureRandomFloat() * 0.06})`;
        ctx.fillRect(0, y, 600, 1);
      }
      raf2 = requestAnimationFrame(drawN);
    };
    raf2 = requestAnimationFrame(drawN);
    return () => {
      cancelAnimationFrame(raf2);
    };
  }, [prefersReducedMotion]);
  useEffect(() => {
    if (prefersReducedMotion) {
      setVis({ text: '', strike: 0, suffix: '', phase: 'hidden' });
      setGx({ on: false, text: '', shk: [0, 0], chr: 0, slices: [], flash: false });
      setResurrected(true);
      return;
    }
    const run = async () => {
      if (!m.current) {
        return;
      }
      const full = HERO_LOOP_PRIMARY + HERO_LOOP_DEATH_SUFFIX;
      const continueWhileMounted = () => m.current;
      const cycle = async (): Promise<void> => {
        if (!continueWhileMounted()) {
          return;
        }
        setResurrected(false);
        setGx({ on: false, text: '', shk: [0, 0], chr: 0, slices: [], flash: false });
        await runSequentialRange(
          0,
          HERO_LOOP_PRIMARY.length,
          1,
          async (index) => {
            setVis({
              text: HERO_LOOP_PRIMARY.slice(0, index),
              strike: 0,
              suffix: '',
              phase: 'typing',
            });
            await wait(HERO_LOOP_PRIMARY[index] === ' ' ? 45 : 55 + secureRandomFloat() * 35);
          },
          continueWhileMounted,
        );
        if (!continueWhileMounted()) {
          return;
        }
        await wait(450);
        setVis((d) => ({ ...d, phase: 'strike' }));
        await runSequentialRange(
          0,
          100,
          3,
          async (index) => {
            setVis((d) => ({ ...d, strike: index }));
            await wait(7);
          },
          continueWhileMounted,
        );
        if (!continueWhileMounted()) {
          return;
        }
        await wait(250);
        await runSequentialRange(
          0,
          HERO_LOOP_DEATH_SUFFIX.length,
          1,
          async (index) => {
            setVis((d) => ({
              ...d,
              suffix: HERO_LOOP_DEATH_SUFFIX.slice(0, index),
              phase: 'death',
            }));
            await wait(75 + secureRandomFloat() * 35);
          },
          continueWhileMounted,
        );
        if (!continueWhileMounted()) {
          return;
        }
        await wait(700);
        await runSequentialRange(
          0,
          7,
          1,
          async (index) => {
            setGx({
              on: true,
              text: scrambleText(full, index * 0.06),
              shk: [
                (secureRandomFloat() - 0.5) * index * 0.6,
                (secureRandomFloat() - 0.5) * index * 0.4,
              ],
              chr: index * 1.8,
              slices: index > 4 ? buildGlitchSlices() : [],
              flash: false,
            });
            await wait(45);
          },
          continueWhileMounted,
        );
        if (!continueWhileMounted()) {
          return;
        }
        await runSequentialRange(
          0,
          15,
          1,
          async (index) => {
            setGx({
              on: true,
              text: scrambleText(full, Math.min(1, 0.3 + index * 0.05)),
              shk: [(secureRandomFloat() - 0.5) * 14, (secureRandomFloat() - 0.5) * 7],
              chr: 8 + secureRandomFloat() * 7,
              slices: buildGlitchSlices(),
              flash: index === 8,
            });
            await wait(38);
          },
          continueWhileMounted,
        );
        if (!continueWhileMounted()) {
          return;
        }
        setGx((g) => ({ ...g, flash: true, chr: 20 }));
        await wait(50);
        setVis((d) => ({ ...d, phase: 'hidden' }));
        await runSequentialRange(
          0,
          13,
          1,
          async (index) => {
            const progress = index / 14;
            const mixed = HERO_LOOP_RESURRECTED.split('')
              .map((character) =>
                character === ' ' ? ' ' : secureRandomFloat() < progress ? character : rc(),
              )
              .join('');
            setGx({
              on: true,
              text: mixed,
              shk: [
                (secureRandomFloat() - 0.5) * (7 - progress * 7),
                (secureRandomFloat() - 0.5) * (3 - progress * 3),
              ],
              chr: (1 - progress) * 10,
              slices: progress > 0.6 ? [] : buildGlitchSlices(),
              flash: false,
            });
            await wait(38);
          },
          continueWhileMounted,
        );
        if (!continueWhileMounted()) {
          return;
        }
        setGx({ on: false, text: '', shk: [0, 0], chr: 0, slices: [], flash: false });
        setResurrected(true);
        await wait(3200);
        if (!continueWhileMounted()) {
          return;
        }
        await runSequentialRange(
          0,
          5,
          1,
          async (index) => {
            setGx({
              on: true,
              text: scrambleText(HERO_LOOP_RESURRECTED, index * 0.14),
              shk: [(secureRandomFloat() - 0.5) * index * 1.8, (secureRandomFloat() - 0.5) * index],
              chr: index * 2.5,
              slices: index > 3 ? buildGlitchSlices() : [],
              flash: false,
            });
            await wait(45);
          },
          continueWhileMounted,
        );
        if (!continueWhileMounted()) {
          return;
        }
        setGx((g) => ({ ...g, flash: true }));
        await wait(40);
        setResurrected(false);
        setGx({ on: false, text: '', shk: [0, 0], chr: 0, slices: [], flash: false });
        await wait(250);
        if (!continueWhileMounted()) {
          return;
        }
        await cycle();
      };
      await cycle();
    };
    run();
    return () => {
      m.current = false;
    };
  }, [prefersReducedMotion]);
  const ts = {
    fontSize: 'clamp(18px,5vw,50px)',
    fontWeight: 800,
    fontFamily: F,
    letterSpacing: '-.03em',
    lineHeight: 1.2,
    whiteSpace: 'nowrap' as const,
  };
  if (prefersReducedMotion) {
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
        <div style={{ ...ts, color: E }}>{HERO_LOOP_RESURRECTED}</div>
      </div>
    );
  }
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
      <canvas
        ref={noiseRef}
        style={{
          position: 'absolute',
          inset: -20,
          width: 'calc(100% + 40px)',
          height: 'calc(100% + 40px)',
          pointerEvents: 'none',
          zIndex: 3,
          opacity: gx.on ? 0.55 : 0,
          mixBlendMode: 'screen',
        }}
      />
      {gx.flash && (
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
      )}
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
          <span style={{ ...ts, color: E, transition: 'opacity .4s' }}>
            {HERO_LOOP_RESURRECTED}
          </span>
        )}
      </div>
    </div>
  );
}
