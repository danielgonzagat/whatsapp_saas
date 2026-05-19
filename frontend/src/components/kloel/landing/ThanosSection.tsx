'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, radius } from '@/lib/design-tokens';
import { useEffect, useRef, useState } from 'react';
import { THANOS_ICONS } from './thanos-icons';
import {
  E,
  F,
  M,
  SALES_CHANNELS,
  SALES_DELAY_MS,
  THANOS_STYLES,
  type ChannelKey,
  type SalesMessage,
} from './thanos-section.const';
import { useSalesFlow } from '@/hooks/useSalesFlow';
import {
  buildLegacyLayout,
  drawScene,
  thanosLoadImages,
  captureParticles,
  blendSquare,
  updateParticleMotion,
  isParticleOffscreen,
  type LegacyLayout,
  type LoadedIcon,
  type Particle,
} from './ThanosSection.helpers';

export {
  buildLegacyLayout,
  drawScene,
  thanosLoadImages,
  captureParticles,
  blendSquare,
  particleNoise,
  updateParticleMotion,
  isParticleOffscreen,
} from './ThanosSection.helpers';

const STATIC_HOLD_MS = 2000;
const PRE_REVEAL_MS = 600;
const REVEAL_HOLD_MS = 5000;
const THANOS_REVEAL_ANIMATION_CSS = THANOS_STYLES;

function playMessage(_n: number): Promise<void> {
  return Promise.resolve();
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createEmptySalesMessages(): Record<ChannelKey, SalesMessage[]> {
  return { wa: [], ig: [], fb: [], em: [], sms: [], tt: [] };
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

function ThanosOmniSales({ runToken }: { runToken: number }) {
  const [msgs, setMsgs] = useState<Record<ChannelKey, SalesMessage[]>>(
    createEmptySalesMessages,
  );
  const { messages: flowMessages } = useSalesFlow();

  useEffect(() => {
    if (!runToken) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      for (const [idx, msg] of flowMessages.entries()) {
        await wait(msg.f === '$' ? 520 : msg.f === 'a' ? 380 : 260);
        if (cancelled) {
          return;
        }
        setMsgs((prev) => ({ ...prev, [msg.ch]: [...prev[msg.ch], msg] }));
        await playMessage(idx + 1);
      }

      await playMessage(0);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [flowMessages, runToken]);

  return (
    <div style={{ animation: runToken ? 'thanosIn .8s cubic-bezier(.22,1,.36,1) both' : 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 16 }}>
        {(Object.keys(SALES_CHANNELS) as ChannelKey[]).map((key) => (
          <div
            key={key}
            style={{
              background: colors.background.void,
              borderRadius: radius.md,
              border: `1px solid ${colors.divider}`,
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid rgb(25, 25, 28)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: radius.full,
                  background: SALES_CHANNELS[key].c,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: SALES_CHANNELS[key].c,
                  fontFamily: M,
                }}
              >
                {SALES_CHANNELS[key].n}
              </span>
            </div>
            <div
              style={{
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minHeight: 60,
              }}
            >
              {(msgs[key] || []).slice(-3).map((msg) =>
                msg.f === '$' ? (
                  <div
                    key={`${key}-${msg.f}-${msg.t}`}
                    style={{ textAlign: 'center', animation: 'thanosIn .2s ease both' }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: SALES_CHANNELS.sms.c,
                        fontFamily: M,
                      }}
                    >
                      {msg.t}
                    </span>
                  </div>
                ) : (
                  <div
                    key={`${key}-${msg.f}-${msg.t}`}
                    style={{
                      alignSelf: msg.f === 'a' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      animation: 'thanosIn .2s ease both',
                    }}
                  >
                    <div
                      style={{
                        background:
                          msg.f === 'a' ? 'rgb(25, 25, 28)' : `${SALES_CHANNELS[key].c}12`,
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 10,
                        color: 'rgb(224, 221, 216)',
                        lineHeight: 1.4,
                        fontFamily: F,
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                      }}
                    >
                      {msg.t}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Thanos section. */
export default function ThanosSection() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const secRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const [showReveal, setShowReveal] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const [started, setStarted] = useState(false);
  const [imgsLoaded, setImgsLoaded] = useState<LoadedIcon[] | null>(null);
  const [salesRunToken, setSalesRunToken] = useState(0);

  useEffect(() => {
    thanosLoadImages(THANOS_ICONS).then(setImgsLoaded);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const el = secRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    if (!started || !imgsLoaded?.length) {
      return;
    }
    const canvas = cvRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return;
    }

    let alive = true;
    let currentFrame: ImageData | null = null;
    let currentBuffer: Uint8ClampedArray | null = null;

    const animate = (layout: LegacyLayout, particles: Particle[]) =>
      new Promise<void>((resolve) => {
        if (!currentFrame || !currentBuffer) {
          resolve();
          return;
        }

        let previous = performance.now();

        const tick = (now: number) => {
          if (!alive || !currentFrame || !currentBuffer) {
            resolve();
            return;
          }

          const dtSec = Math.min((now - previous) / 1000, 0.05);
          previous = now;
          const frameScale = dtSec * 60;
          currentBuffer.fill(0);
          let active = 0;

          for (const particle of particles) {
            particle.ageSec += dtSec;

            if (particle.ageSec < particle.delaySec) {
              active++;
              blendSquare(
                currentBuffer,
                layout.pixelWidth,
                layout.pixelHeight,
                particle.x * layout.dpr,
                particle.y * layout.dpr,
                particle.size * layout.dpr,
                particle.r,
                particle.g,
                particle.b,
                particle.a,
              );
              continue;
            }

            if (particle.life <= 0 || particle.size <= 0.12) {
              continue;
            }

            updateParticleMotion(particle, dtSec, frameScale);

            if (isParticleOffscreen(particle, layout)) {
              continue;
            }
            if (particle.life <= 0 || particle.size <= 0.12) {
              continue;
            }

            active++;
            blendSquare(
              currentBuffer,
              layout.pixelWidth,
              layout.pixelHeight,
              particle.x * layout.dpr,
              particle.y * layout.dpr,
              particle.size * layout.dpr,
              particle.r,
              particle.g,
              particle.b,
              particle.life * particle.a,
            );
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.putImageData(currentFrame, 0, 0);

          if (active > 0) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          resolve();
        };

        rafRef.current = requestAnimationFrame(tick);
      });

    const runCycle = async () => {
      while (alive) {
        setShowReveal(false);
        setShowSales(false);
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        const dpr = window.devicePixelRatio || 1;
        const layout = buildLegacyLayout(width, height, dpr);
        canvas.width = layout.pixelWidth;
        canvas.height = layout.pixelHeight;
        canvas.style.opacity = '1';
        drawScene(ctx, layout, imgsLoaded);

        await wait(STATIC_HOLD_MS);
        if (!alive) {
          return;
        }

        drawScene(ctx, layout, imgsLoaded);
        const particles = captureParticles(ctx, layout);
        currentFrame = ctx.createImageData(layout.pixelWidth, layout.pixelHeight);
        currentBuffer = currentFrame.data;

        await animate(layout, particles);
        if (!alive) {
          return;
        }

        canvas.style.opacity = '0';
        await wait(PRE_REVEAL_MS);
        if (!alive) {
          return;
        }

        setShowReveal(true);
        await wait(SALES_DELAY_MS);
        if (!alive) {
          return;
        }

        setSalesRunToken((value) => value + 1);
        setShowSales(true);
        await wait(REVEAL_HOLD_MS);
        if (!alive) {
          return;
        }

        setShowReveal(false);
        setShowSales(false);
        await wait(400);
      }
    };

    runCycle();
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [imgsLoaded, prefersReducedMotion, started]);

  return (
    <div ref={secRef} style={{ position: 'relative' }}>
      <section
        className="thanos-stage"
        style={{
          padding: '0 24px',
          maxWidth: 860,
          margin: '0 auto',
          position: 'relative',
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <canvas
          ref={cvRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            transition: 'opacity .8s ease',
            opacity: prefersReducedMotion ? 0 : 1,
          }}
        />
        {(prefersReducedMotion || showReveal) && (
          <div
            className="thanos-reveal"
            style={{
              position: 'relative',
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '0 24px',
              animation: prefersReducedMotion ? 'none' : 'thanosIn 1s ease both',
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(28px,4.5vw,40px)',
                fontWeight: 800,
                color: E,
                letterSpacing: '-.03em',
                textAlign: 'center',
                marginBottom: showReveal || showSales ? 52 : 0,
              }}
            >
              {kloelT(`O Kloel escala.`)}
            </h2>
            {(prefersReducedMotion || showReveal || showSales) && (
              <div style={{ width: '100%', maxWidth: 740 }}>
                <ThanosOmniSales
                  key={prefersReducedMotion ? 'static' : salesRunToken}
                  runToken={prefersReducedMotion ? 0 : salesRunToken}
                />
              </div>
            )}
          </div>
        )}
      </section>
      <style>{THANOS_REVEAL_ANIMATION_CSS}</style>
    </div>
  );
}
