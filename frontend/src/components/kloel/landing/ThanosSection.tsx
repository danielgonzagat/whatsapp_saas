'use client';

import { kloelT } from '@/lib/i18n/t';
import { useEffect, useRef, useState } from 'react';
import { THANOS_ICONS } from './thanos-icons';
import { colors } from '@/lib/design-tokens';
import {
  E,
  ELEVATED,
  EMPTY_MESSAGES,
  F,
  M,
  SALES_CHANNELS,
  SALES_DELAY_MS,
  SALES_FLOW,
  SUCCESS,
  SURFACE,
  THANOS_STYLES,
  THANOS_TITLE,
  type ChannelKey,
  type SalesMessage,
} from './thanos-section.const';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PARTICLES_PER_ICON = 150;
const DUST_DURATION_MS = 3000;
const ICON_STAGGER_MS = 140;

type DustParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  delay: number;
  life: number;
  alpha: number;
};

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
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
  const [msgs, setMsgs] = useState<Record<ChannelKey, SalesMessage[]>>(EMPTY_MESSAGES);

  useEffect(() => {
    if (!runToken) {
      return;
    }

    let cancelled = false;
    setMsgs(EMPTY_MESSAGES);

    const run = async () => {
      for (const msg of SALES_FLOW) {
        await wait(msg.f === '$' ? 520 : msg.f === 'a' ? 380 : 260);
        if (cancelled) {
          return;
        }
        setMsgs((prev) => ({ ...prev, [msg.ch]: [...prev[msg.ch], msg] }));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [runToken]);

  return (
    <div style={{ animation: runToken ? 'thanosIn .6s cubic-bezier(.22,1,.36,1) both' : 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 16 }}>
        {(Object.keys(SALES_CHANNELS) as ChannelKey[]).map((key) => (
          <div
            key={key}
            style={{ background: SURFACE, borderRadius: 6, border: `1px solid ${ELEVATED}` }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${ELEVATED}`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 4,
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
                    key={key + '-' + msg.f + '-' + msg.t}
                    style={{ textAlign: 'center', animation: 'thanosIn .18s ease both' }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, color: SUCCESS, fontFamily: M }}>
                      {msg.t}
                    </span>
                  </div>
                ) : (
                  <div
                    key={key + '-' + msg.f + '-' + msg.t}
                    style={{
                      alignSelf: msg.f === 'a' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      animation: 'thanosIn .18s ease both',
                    }}
                  >
                    <div
                      style={{
                        background: msg.f === 'a' ? ELEVATED : colors.ember.bg,
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 10,
                        color: colors.text.silver,
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
  const secRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iconRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [started, setStarted] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const [salesRunToken, setSalesRunToken] = useState(0);
  const [dustRunToken, setDustRunToken] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setStarted(false);
      setShowReveal(true);
      setShowSales(true);
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
    if (prefersReducedMotion || !started) {
      return;
    }

    let alive = true;
    const run = async () => {
      while (alive) {
        setShowReveal(false);
        setShowSales(false);
        setDustRunToken((value) => value + 1);
        await wait(DUST_DURATION_MS + THANOS_ICONS.length * ICON_STAGGER_MS);
        if (!alive) {
          return;
        }
        await new Promise((r) => requestAnimationFrame(r));
        setShowReveal(true);
        await wait(SALES_DELAY_MS);
        if (!alive) {
          return;
        }
        setSalesRunToken((value) => value + 1);
        setShowSales(true);
        await wait(7600);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [prefersReducedMotion, started]);

  useEffect(() => {
    if (prefersReducedMotion || !dustRunToken) {
      return;
    }

    const canvas = canvasRef.current;
    const section = secRef.current;
    if (!canvas || !section) {
      return;
    }

    const rect = section.getBoundingClientRect();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const particles: DustParticle[] = [];
    iconRefs.current.forEach((node, iconIndex) => {
      if (!node) {
        return;
      }
      const iconRect = node.getBoundingClientRect();
      const left = iconRect.left - rect.left;
      const top = iconRect.top - rect.top;
      for (let particleIndex = 0; particleIndex < PARTICLES_PER_ICON; particleIndex += 1) {
        const seed = iconIndex * 1000 + particleIndex + 1;
        const angle = -Math.PI / 2 + (seededUnit(seed + 31) - 0.5) * 1.35;
        const speed = 18 + seededUnit(seed + 47) * 62;
        particles.push({
          x: left + seededUnit(seed) * iconRect.width,
          y: top + seededUnit(seed + 17) * iconRect.height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 16,
          size: 0.7 + seededUnit(seed + 59) * 1.9,
          delay: iconIndex * ICON_STAGGER_MS + seededUnit(seed + 71) * 120,
          life: 1100 + seededUnit(seed + 83) * 980,
          alpha: 0.34 + seededUnit(seed + 97) * 0.5,
        });
      }
    });

    if (particles.length === 0) {
      return;
    }

    canvas.style.opacity = '1';
    let frame = 0;
    const startedAt = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startedAt;
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = colors.ember.primary;
      particles.forEach((particle) => {
        const local = elapsed - particle.delay;
        if (local < 0 || local > particle.life) {
          return;
        }
        const progress = local / particle.life;
        const driftX = particle.x + particle.vx * progress;
        const driftY = particle.y + particle.vy * progress - 44 * progress * progress;
        ctx.globalAlpha = particle.alpha * (1 - progress);
        ctx.beginPath();
        ctx.arc(driftX, driftY, particle.size * (1 - progress * 0.35), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      if (elapsed < DUST_DURATION_MS + THANOS_ICONS.length * ICON_STAGGER_MS) {
        frame = requestAnimationFrame(animate);
        return;
      }
      ctx.clearRect(0, 0, rect.width, rect.height);
      canvas.style.opacity = '0';
    };

    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, rect.width, rect.height);
      canvas.style.opacity = '0';
    };
  }, [dustRunToken, prefersReducedMotion]);

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
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
        {!prefersReducedMotion && (
          <div
            className={
              showReveal
                ? 'thanos-icons thanos-icons--exit'
                : dustRunToken
                  ? 'thanos-icons thanos-icons--dusting'
                  : 'thanos-icons'
            }
            aria-hidden={showReveal}
          >
            <h2>{kloelT(THANOS_TITLE)}</h2>
            <div>
              {THANOS_ICONS.map((icon, index) => (
                <span
                  key={icon.id}
                  ref={(node) => {
                    iconRefs.current[index] = node;
                  }}
                  style={{ animationDelay: index * ICON_STAGGER_MS + 'ms' }}
                >
                  <img src={icon.d} alt="" loading="lazy" decoding="async" />
                </span>
              ))}
            </div>
          </div>
        )}
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
              animation: prefersReducedMotion ? 'none' : 'thanosIn .8s ease both',
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(28px,4.5vw,40px)',
                fontWeight: 800,
                color: E,
                letterSpacing: 0,
                textAlign: 'center',
                marginBottom: showSales ? 52 : 0,
              }}
            >
              {kloelT('O Kloel escala.')}
            </h2>
            {(prefersReducedMotion || showSales) && (
              <div style={{ width: '100%', maxWidth: 740 }}>
                <ThanosOmniSales runToken={prefersReducedMotion ? 1 : salesRunToken} />
              </div>
            )}
          </div>
        )}
      </section>
      <style>{THANOS_STYLES}</style>
    </div>
  );
}
