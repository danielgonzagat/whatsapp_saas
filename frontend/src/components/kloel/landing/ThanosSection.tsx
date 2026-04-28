'use client';

import { kloelT } from '@/lib/i18n/t';
import { useEffect, useRef, useState } from 'react';
import { THANOS_ICONS } from './thanos-icons';
import { secureRandomFloat } from '@/lib/secure-random';

const F = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const E = '#E85D30';
const THANOS_TITLE = 'Elas não escalam por você.';
const STATIC_HOLD_MS = 3000;
const PRE_REVEAL_MS = 500;
const SALES_DELAY_MS = 800;
const REVEAL_HOLD_MS = 8000;
const PHI = 1.618033988749895;

type LoadedIcon = (typeof THANOS_ICONS)[number] & { img: HTMLImageElement };
type ChannelKey = 'wa' | 'ig' | 'fb' | 'em' | 'sms' | 'tt';

type LegacyLayout = {
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
  isMobile: boolean;
  iconSize: number;
  containerSize: number;
  containerRadius: number;
  cols: number;
  rows: number;
  gapX: number;
  gapY: number;
  ox: number;
  oy: number;
  txtSize: number;
  txtY: number;
  centers: { x: number; y: number; idx: number }[];
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dvx: number;
  dvy: number;
  size: number;
  r: number;
  g: number;
  b: number;
  a: number;
  tr: number;
  tg: number;
  tb: number;
  life: number;
  decay: number;
  shrink: number;
  delaySec: number;
  ageSec: number;
  ramp: number;
};

type SalesMessage = {
  ch: ChannelKey;
  f: 'l' | 'a' | '$';
  t: string;
};

const SALES_CHANNELS: Record<ChannelKey, { n: string; c: string }> = {
  wa: { n: 'WhatsApp', c: '#25D366' },
  ig: { n: 'Instagram', c: '#E1306C' },
  fb: { n: 'Messenger', c: '#0084FF' },
  em: { n: 'Email', c: E },
  sms: { n: 'SMS', c: '#10B981' },
  tt: { n: 'TikTok', c: '#FF0050' },
};

const SALES_FLOW: SalesMessage[] = [
  { ch: 'wa', f: 'l', t: 'Oi, vi o anúncio!' },
  { ch: 'ig', f: 'l', t: 'Amei o produto!' },
  { ch: 'wa', f: 'a', t: 'Olá! R$497 ou 12x.' },
  { ch: 'fb', f: 'l', t: 'Tem disponível?' },
  { ch: 'em', f: 'a', t: 'Julia, bônus expira — 30% OFF' },
  { ch: 'ig', f: 'a', t: 'Cupom INSTA20 = 20% OFF!' },
  { ch: 'sms', f: 'a', t: 'Carrinho aberto!' },
  { ch: 'tt', f: 'l', t: 'Vi no TikTok!' },
  { ch: 'fb', f: 'a', t: 'R$497, acesso vitalício.' },
  { ch: 'wa', f: 'l', t: 'Quero!' },
  { ch: 'tt', f: 'a', t: 'Últimas vagas!' },
  { ch: 'wa', f: 'a', t: 'pay.kloel.com/ck/abc' },
  { ch: 'ig', f: 'l', t: 'Me manda!' },
  { ch: 'ig', f: 'a', t: 'pay.kloel.com/ck/pedro' },
  { ch: 'wa', f: '$', t: 'R$397 Pix' },
  { ch: 'em', f: '$', t: 'R$347 Pix' },
  { ch: 'ig', f: '$', t: 'R$397 cartão' },
  { ch: 'fb', f: '$', t: 'R$497 Pix' },
  { ch: 'sms', f: '$', t: 'R$297 recuperado' },
  { ch: 'tt', f: '$', t: 'R$397 Pix' },
];

const EMPTY_MESSAGES: Record<ChannelKey, SalesMessage[]> = {
  wa: [],
  ig: [],
  fb: [],
  em: [],
  sms: [],
  tt: [],
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getPrefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mediaQuery.matches);

    apply();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', apply);
      return () => mediaQuery.removeEventListener('change', apply);
    }

    mediaQuery.addListener?.(apply);
    return () => mediaQuery.removeListener?.(apply);
  }, []);

  return prefersReducedMotion;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildLegacyLayout(width: number, height: number, dpr: number): LegacyLayout {
  const isMobile = width < 500;
  const iconSize = isMobile ? 56 : 80;
  const containerSize = iconSize + (isMobile ? 20 : 28);
  const containerRadius = isMobile ? 14 : 18;
  const cols = isMobile ? 2 : 5;
  const rows = isMobile ? 5 : 2;
  const gapX = containerSize * (isMobile ? 1.6 : 1.55);
  const gapY = containerSize * (isMobile ? 1.15 : 1.5);
  const totalW = (cols - 1) * gapX;
  const ox = (width - totalW) / 2;
  const gridH = (rows - 1) * gapY + containerSize;
  const txtSize = isMobile ? Math.min(18, width * 0.045) : Math.min(38, width * 0.045);
  const txtMarginBottom = isMobile ? 28 : 40;
  const totalContentH = txtSize + txtMarginBottom + gridH;
  const contentTop = Math.max(20, (height - totalContentH) / 2);
  const txtY = contentTop + txtSize / 2;
  const oy = contentTop + txtSize + txtMarginBottom + containerSize / 2;
  const centers = THANOS_ICONS.map((_, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    return {
      x: ox + col * gapX,
      y: oy + row * gapY,
      idx,
    };
  });

  return {
    width,
    height,
    pixelWidth: Math.round(width * dpr),
    pixelHeight: Math.round(height * dpr),
    dpr,
    isMobile,
    iconSize,
    containerSize,
    containerRadius,
    cols,
    rows,
    gapX,
    gapY,
    ox,
    oy,
    txtSize,
    txtY,
    centers,
  };
}

function drawScene(ctx: CanvasRenderingContext2D, layout: LegacyLayout, icons: LoadedIcon[]) {
  ctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.font = `800 ${layout.txtSize}px Sora,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(224,221,216,0.75)';
  ctx.fillText(THANOS_TITLE, layout.width / 2, layout.txtY);

  icons.forEach((icon, index) => {
    const center = layout.centers[index];
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const rx = center.x - layout.containerSize / 2;
    const ry = center.y - layout.containerSize / 2;
    ctx.roundRect(rx, ry, layout.containerSize, layout.containerSize, layout.containerRadius);
    ctx.fill();

    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rx, ry, layout.containerSize, layout.containerSize, layout.containerRadius);
    ctx.stroke();

    ctx.globalAlpha = 0.5;
    ctx.drawImage(
      icon.img,
      center.x - layout.iconSize / 2,
      center.y - layout.iconSize / 2,
      layout.iconSize,
      layout.iconSize,
    );
  });

  ctx.globalAlpha = 1;
}

async function thanosLoadImages(icons: typeof THANOS_ICONS): Promise<LoadedIcon[]> {
  const loaded = await Promise.all(
    icons.map(
      (icon) =>
        new Promise<LoadedIcon | null>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve({ ...icon, img });
          img.onerror = () => resolve(null);
          img.decoding = 'async';
          img.src = icon.d;
        }),
    ),
  );
  return loaded.filter((icon): icon is LoadedIcon => Boolean(icon));
}

function captureParticles(ctx: CanvasRenderingContext2D, layout: LegacyLayout) {
  const imgData = ctx.getImageData(0, 0, layout.pixelWidth, layout.pixelHeight);
  const data = imgData.data;
  const particles: Particle[] = [];

  for (let py = 0; py < layout.pixelHeight; py += 2) {
    for (let px = 0; px < layout.pixelWidth; px += 3) {
      const index = (py * layout.pixelWidth + px) * 4;
      if (data[index + 3] <= 10) {
        continue;
      }

      const x = px / layout.dpr;
      const y = py / layout.dpr;
      let nearest = layout.centers[0];
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const center of layout.centers) {
        const dx = x - center.x;
        const dy = y - center.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < nearestDistance) {
          nearestDistance = distanceSquared;
          nearest = center;
        }
      }

      const nd = Math.sqrt(nearestDistance);
      const ang = secureRandomFloat() * 6.28;
      const spd = 0.4 + nd * 0.015 + secureRandomFloat() * 0.6;
      const vx0 = Math.cos(ang) * spd;
      const vy0 = Math.sin(ang) * spd;
      const goldenPhase = (nearest.idx * PHI) % 1;
      const delayFrames = Math.max(0, Math.round(goldenPhase * 34 + secureRandomFloat() * 21));

      particles.push({
        x,
        y,
        vx: vx0 * 0.01,
        vy: vy0 * 0.01,
        dvx: vx0,
        dvy: vy0,
        size: layout.isMobile ? 0.3 + secureRandomFloat() * 0.6 : 0.4 + secureRandomFloat() * 1.2,
        r: data[index],
        g: data[index + 1],
        b: data[index + 2],
        a: data[index + 3] / 255,
        tr: 125 + secureRandomFloat() * 35,
        tg: 85 + secureRandomFloat() * 25,
        tb: 50 + secureRandomFloat() * 20,
        life: 1,
        decay: 0.0046 + nd * 0.00005 + secureRandomFloat() * 0.0024,
        shrink: 0.9953 + secureRandomFloat() * 0.002,
        delaySec: delayFrames / 60,
        ageSec: 0,
        ramp: 0,
      });
    }
  }

  return particles;
}

function blendSquare(
  buffer: Uint8ClampedArray,
  widthPx: number,
  heightPx: number,
  xPx: number,
  yPx: number,
  sizePx: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
) {
  const startX = Math.round(xPx);
  const startY = Math.round(yPx);
  const span = Math.max(1, Math.round(sizePx));
  const srcA = clamp(alpha, 0, 1);
  if (srcA <= 0) {
    return;
  }

  for (let py = 0; py < span; py++) {
    const y = startY + py;
    if (y < 0 || y >= heightPx) {
      continue;
    }
    for (let px = 0; px < span; px++) {
      const x = startX + px;
      if (x < 0 || x >= widthPx) {
        continue;
      }
      const idx = (y * widthPx + x) * 4;
      const dstA = buffer[idx + 3] / 255;

      if (dstA <= 0) {
        buffer[idx] = r;
        buffer[idx + 1] = g;
        buffer[idx + 2] = b;
        buffer[idx + 3] = Math.round(srcA * 255);
        continue;
      }

      const outA = srcA + dstA * (1 - srcA);
      buffer[idx] = Math.round((r * srcA + buffer[idx] * dstA * (1 - srcA)) / outA);
      buffer[idx + 1] = Math.round((g * srcA + buffer[idx + 1] * dstA * (1 - srcA)) / outA);
      buffer[idx + 2] = Math.round((b * srcA + buffer[idx + 2] * dstA * (1 - srcA)) / outA);
      buffer[idx + 3] = Math.round(outA * 255);
    }
  }
}

function updateParticleMotion(particle: Particle, dtSec: number, frameScale: number) {
  const localSec = particle.ageSec - particle.delaySec;
  particle.ramp = Math.min(1, localSec / (30 / 60));
  particle.vx += particle.dvx * 0.008 * particle.ramp * frameScale;
  particle.vy += particle.dvy * 0.008 * particle.ramp * frameScale;
  particle.vy += 0.035 * particle.ramp * frameScale;
  const damping = 0.993 ** frameScale;
  particle.vx *= damping;
  particle.vy *= damping;
  particle.x += particle.vx * frameScale;
  particle.y += particle.vy * frameScale;

  const ca = Math.min(1, localSec * 3);
  particle.r += (particle.tr - particle.r) * 0.03 * ca * frameScale;
  particle.g += (particle.tg - particle.g) * 0.03 * ca * frameScale;
  particle.b += (particle.tb - particle.b) * 0.03 * ca * frameScale;
  particle.size *= particle.shrink ** frameScale;
  particle.life -= particle.decay * frameScale;
}

function isParticleOffscreen(particle: Particle, layout: LegacyLayout): boolean {
  return (
    particle.x + particle.size < -8 ||
    particle.y + particle.size < -8 ||
    particle.x > layout.width + 8 ||
    particle.y > layout.height + 8
  );
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
      const playMessage = async (index: number): Promise<void> => {
        if (index >= SALES_FLOW.length || cancelled) {
          return;
        }
        const msg = SALES_FLOW[index];
        if (cancelled) {
          return;
        }
        await wait(msg.f === '$' ? 900 : msg.f === 'a' ? 600 : 400);
        if (cancelled) {
          return;
        }
        setMsgs((prev) => ({ ...prev, [msg.ch]: [...prev[msg.ch], msg] }));
        await playMessage(index + 1);
      };

      await playMessage(0);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [runToken]);

  return (
    <div style={{ animation: runToken ? 'thanosIn .8s cubic-bezier(.22,1,.36,1) both' : 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 16 }}>
        {(Object.keys(SALES_CHANNELS) as ChannelKey[]).map((key) => (
          <div
            key={key}
            style={{ background: '#0D0D10', borderRadius: 6, border: '1px solid #19191C' }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid #19191C',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
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
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#10B981', fontFamily: M }}>
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
                        background: msg.f === 'a' ? '#19191C' : `${SALES_CHANNELS[key].c}12`,
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 10,
                        color: '#E0DDD8',
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
      setStarted(false);
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
                marginBottom: showSales ? 52 : 0,
              }}
            >
              {kloelT(`O Kloel escala.`)}
            </h2>
            {(prefersReducedMotion || showSales) && (
              <div style={{ width: '100%', maxWidth: 740 }}>
                <ThanosOmniSales runToken={prefersReducedMotion ? 0 : salesRunToken} />
              </div>
            )}
          </div>
        )}
      </section>
      <style>{`@keyframes thanosIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
