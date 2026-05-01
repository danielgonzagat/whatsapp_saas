'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { buildAuthUrl } from '@/lib/subdomains';
import Link from 'next/link';
import { useState, useEffect, useRef, useId } from 'react';
import { KloelBrandLockup, KloelMushroomVisual, KloelWordmark } from '../KloelBrand';
import { delayForTypewriter, runSequentialList, runSequentialRange } from './KloelLanding.helpers';
import ThanosSection from './ThanosSection';
import { secureRandomFloat } from '@/lib/secure-random';

const F = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const E = colors.ember.primary;
const V = colors.background.void;
const GC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&!?<>{}|/\\~';
const rc = () => GC[Math.floor(secureRandomFloat() * GC.length)];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type HeroLoopPhase = 'idle' | 'typing' | 'strike' | 'death' | 'hidden';

type HeroLoopViewState = {
  text: string;
  strike: number;
  suffix: string;
  phase: HeroLoopPhase;
};

type HeroLoopGlitchSlice = {
  top: number;
  h: number;
  off: number;
};

type HeroLoopGlitchState = {
  on: boolean;
  text: string;
  shk: [number, number];
  chr: number;
  slices: HeroLoopGlitchSlice[];
  flash: boolean;
};

type MultiChannelKey = 'wa' | 'ig' | 'em';
type MultiChannelFlowType = 'lead' | 'ai' | 'ok';

type MultiChannelMessage = {
  ch: MultiChannelKey;
  f: MultiChannelFlowType;
  text: string;
  t: string;
  n?: string;
};

type MultiChannelState = Record<MultiChannelKey, MultiChannelMessage[]>;

const HERO_LOOP_PRIMARY = 'O Marketing Digital';
const HERO_LOOP_DEATH_SUFFIX = ' acabou.';
const HERO_LOOP_RESURRECTED = 'O Marketing Artificial começou.';
const FINAL_MANIFEST_FIRST = 'Morre o Marketing Digital.';
const FINAL_MANIFEST_SECOND_PREFIX = 'Nasce o ';
const FINAL_MANIFEST_SECOND_EMPHASIS = 'Marketing Artificial';
const FINAL_MANIFEST_SECOND = `${FINAL_MANIFEST_SECOND_PREFIX}${FINAL_MANIFEST_SECOND_EMPHASIS}`;
const MULTI_CHANNEL_FLOW: MultiChannelMessage[] = [
  { ch: 'wa', f: 'lead', n: 'Marina C.', text: 'Vi o anuncio, quanto custa?', t: '09:02' },
  { ch: 'ig', f: 'lead', n: 'Pedro A.', text: 'Amei o produto! Como compro?', t: '09:03' },
  {
    ch: 'wa',
    f: 'ai',
    text: 'Ola Marina! R$497 a vista ou 12x. Posso enviar o link?',
    t: '09:02',
  },
  {
    ch: 'em',
    f: 'ai',
    n: 'Email',
    text: 'Assunto: Julia, seu bonus expira hoje — 30% OFF',
    t: '09:04',
  },
  {
    ch: 'ig',
    f: 'ai',
    text: 'Ola Pedro! Acesso vitalício por R$497. Cupom INSTA20 = 20% OFF!',
    t: '09:03',
  },
  { ch: 'wa', f: 'lead', n: 'Marina C.', text: 'Quero sim!', t: '09:05' },
  { ch: 'wa', f: 'ai', text: 'Link: pay.kloel.com/ck/abc — Pix, cartão ou boleto.', t: '09:05' },
  { ch: 'ig', f: 'lead', n: 'Pedro A.', text: 'Me manda o link!', t: '09:06' },
  { ch: 'em', f: 'ai', n: 'Evento', text: 'Julia clicou no link — checkout aberto', t: '09:06' },
  { ch: 'ig', f: 'ai', text: 'pay.kloel.com/ck/pedro — Cupom INSTA20 já aplicado!', t: '09:06' },
  { ch: 'wa', f: 'ok', text: 'Pagamento confirmado — R$397 via Pix', t: '09:08' },
  { ch: 'ig', f: 'ok', text: 'Pagamento confirmado — R$397,60 via cartão', t: '09:09' },
  { ch: 'em', f: 'ok', text: 'Pagamento confirmado — R$347,90 via Pix', t: '09:10' },
];

function scrambleText(src: string, chaos: number) {
  return src
    .split('')
    .map((c) => (c === ' ' ? ' ' : secureRandomFloat() < chaos ? rc() : c))
    .join('');
}

function buildGlitchSlices(): HeroLoopGlitchSlice[] {
  return Array.from({ length: 5 }, () => ({
    top: secureRandomFloat() * 100,
    h: 2 + secureRandomFloat() * 14,
    off: (secureRandomFloat() - 0.5) * 28,
  }));
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mediaQuery.matches);

    apply();
    mediaQuery.addEventListener?.('change', apply);
    return () => mediaQuery.removeEventListener?.('change', apply);
  }, []);

  return prefersReducedMotion;
}

function BrandDivider({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: compact ? 120 : 'min(72vw, 600px)',
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(232,93,48,0.8), transparent)',
          opacity: compact ? 0.7 : 0.45,
        }}
      />
    </div>
  );
}

function HeroLoop() {
  const [vis, setVis] = useState<HeroLoopViewState>({
    text: '',
    strike: 0,
    suffix: '',
    phase: 'idle',
  });
  const [gx, setGx] = useState<HeroLoopGlitchState>({
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
                color: '#FF000055',
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
                color: '#0000FF45',
                zIndex: 1,
              }}
            >
              {gx.text}
            </div>
          </>
        )}
        {gx.slices.map((s, _i) => (
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
import "./__parts__/KloelLanding.part";
