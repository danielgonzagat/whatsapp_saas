'use client';
import { useEffect, useRef, useState } from 'react';
import { secureRandomFloat } from '@/lib/secure-random';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { runSequentialRange } from './KloelLanding.helpers';
import { useHeroNoiseCanvasRef, useHeroNoiseCanvas, HeroNoiseCanvas } from './HeroLoopNoiseCanvas';
import { HeroLoopDisplay, HeroLoopReducedMotion, HeroLoopFlash } from './HeroLoopDisplay';

const GC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&!?<>{}|/\\~';
const rc = () => GC[Math.floor(secureRandomFloat() * GC.length)];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HERO_LOOP_PRIMARY = 'O Marketing Digital';
const HERO_LOOP_DEATH_SUFFIX = ' acabou.';
const HERO_LOOP_RESURRECTED = 'O Marketing Artificial começou.';

export type HeroLoopPhase = 'idle' | 'typing' | 'strike' | 'death' | 'hidden';

export type ViewState = {
  text: string;
  strike: number;
  suffix: string;
  phase: HeroLoopPhase;
};

export type GlitchSlice = {
  top: number;
  h: number;
  off: number;
};

export type GlitchState = {
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
  const noiseRef = useHeroNoiseCanvasRef();
  const m = useRef<boolean>(true);
  const prefersReducedMotion = usePrefersReducedMotion();

  useHeroNoiseCanvas(noiseRef, gx.on);

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

  if (prefersReducedMotion) {
    return <HeroLoopReducedMotion />;
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
      <HeroNoiseCanvas noiseRef={noiseRef} glitchOn={gx.on} />
      <HeroLoopFlash gxFlash={gx.flash} />
      <HeroLoopDisplay gx={gx} vis={vis} resurrected={resurrected} />
    </div>
  );
}
