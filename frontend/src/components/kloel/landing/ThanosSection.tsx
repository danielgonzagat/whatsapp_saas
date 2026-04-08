'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { THANOS_ICONS } from './thanos-icons';

const F = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const E = '#E85D30';
const THANOS_TITLE = 'Elas não escalam por você.';
const STATIC_HOLD_MS = 720;
const PRE_REVEAL_MS = 120;
const SALES_DELAY_MS = 760;
const REVEAL_HOLD_MS = 7200;
const DESKTOP_PARTICLE_BUDGET = 4800;
const MOBILE_PARTICLE_BUDGET = 3200;

type LoadedIcon = (typeof THANOS_ICONS)[number] & { img: HTMLImageElement };
type ScenePhase = 'static' | 'fracturing' | 'hidden';
type LayerKind = 'title' | 'tile' | 'logo';
type LayerId = 'title' | 'tile' | 'logo';
type ChannelKey = 'wa' | 'ig' | 'fb' | 'em' | 'sms' | 'tt';

type SceneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TitleLayout = SceneRect & {
  fontSize: number;
  lineHeight: number;
};

type TileLayout = {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  size: number;
  radius: number;
  iconSize: number;
  iconRect: SceneRect;
};

type SceneLayout = {
  width: number;
  height: number;
  isMobile: boolean;
  renderDpr: number;
  title: TitleLayout;
  tiles: TileLayout[];
  fractureOrigin: { x: number; y: number };
};

type LayerCanvas = Record<LayerId, HTMLCanvasElement>;

type ParticleTemplate = {
  kind: LayerKind;
  layer: LayerId;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Particle = ParticleTemplate & {
  age: number;
  delay: number;
  life: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  rotation: number;
  spin: number;
  drag: number;
  gravity: number;
  swirl: number;
  alphaHold: number;
  shrink: number;
  noise: number;
};

type PreparedScene = {
  layout: SceneLayout;
  layers: LayerCanvas;
  templates: ParticleTemplate[];
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInQuad(t: number) {
  return t * t;
}

function pointInRect(x: number, y: number, rect: SceneRect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function sortTemplates(a: ParticleTemplate, b: ParticleTemplate) {
  const order: Record<LayerKind, number> = { tile: 0, logo: 1, title: 2 };
  return order[a.kind] - order[b.kind];
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawPremiumTileSurface(ctx: CanvasRenderingContext2D, tile: TileLayout) {
  const tileGradient = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.size);
  tileGradient.addColorStop(0, '#1A1A20');
  tileGradient.addColorStop(0.48, '#141419');
  tileGradient.addColorStop(1, '#101014');

  ctx.save();
  drawRoundedRect(ctx, tile.x, tile.y, tile.size, tile.size, tile.radius);
  ctx.fillStyle = tileGradient;
  ctx.fill();

  ctx.strokeStyle = '#27272E';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawRoundedRect(ctx, tile.x + 1, tile.y + 1, tile.size - 2, tile.size - 2, tile.radius - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.stroke();

  ctx.clip();

  const topSheen = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.size * 0.48);
  topSheen.addColorStop(0, 'rgba(255,255,255,0.18)');
  topSheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topSheen;
  ctx.fillRect(tile.x, tile.y, tile.size, tile.size * 0.48);

  const emberGlow = ctx.createRadialGradient(
    tile.x + tile.size / 2,
    tile.y + tile.size * 1.1,
    0,
    tile.x + tile.size / 2,
    tile.y + tile.size * 1.1,
    tile.size * 0.82,
  );
  emberGlow.addColorStop(0, 'rgba(232,93,48,0.22)');
  emberGlow.addColorStop(0.55, 'rgba(232,93,48,0.08)');
  emberGlow.addColorStop(1, 'rgba(232,93,48,0)');
  ctx.fillStyle = emberGlow;
  ctx.fillRect(
    tile.x - tile.size * 0.1,
    tile.y + tile.size * 0.42,
    tile.size * 1.2,
    tile.size * 0.75,
  );

  ctx.restore();
}

function drawTitleLayer(ctx: CanvasRenderingContext2D, layout: SceneLayout) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${layout.title.fontSize}px Sora, sans-serif`;
  ctx.fillStyle = '#E0DDD8';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18;
  ctx.fillText(THANOS_TITLE, layout.width / 2, layout.title.y);
  ctx.shadowBlur = 0;
  ctx.fillText(THANOS_TITLE, layout.width / 2, layout.title.y);
  ctx.restore();
}

function buildSceneLayout(width: number, height: number): SceneLayout {
  const isMobile = width < 560;
  const titleFontSize = isMobile ? clamp(width * 0.078, 28, 34) : clamp(width * 0.05, 36, 44);
  const titleHeight = Math.round(titleFontSize * 1.18);
  const titleGap = isMobile ? 26 : 34;
  const tileSize = isMobile ? clamp(width * 0.235, 94, 110) : clamp(width * 0.135, 116, 132);
  const gapX = isMobile ? Math.round(tileSize * 0.18) : Math.round(tileSize * 0.16);
  const gapY = Math.round(tileSize * 0.18);
  const cols = isMobile ? 2 : 5;
  const rows = Math.ceil(THANOS_ICONS.length / cols);
  const gridWidth = cols * tileSize + (cols - 1) * gapX;
  const gridHeight = rows * tileSize + (rows - 1) * gapY;
  const totalHeight = titleHeight + titleGap + gridHeight;
  const top = Math.max(32, Math.round((height - totalHeight) / 2));
  const gridX = Math.round((width - gridWidth) / 2);
  const gridY = top + titleHeight + titleGap;
  const radius = isMobile ? 22 : 24;
  const iconSize = Math.round(tileSize * (isMobile ? 0.56 : 0.54));
  const renderDpr = Math.min(
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    isMobile ? 1.5 : 1.75,
  );

  const tiles = THANOS_ICONS.map((icon, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = gridX + col * (tileSize + gapX);
    const y = gridY + row * (tileSize + gapY);
    const iconX = x + (tileSize - iconSize) / 2;
    const iconY = y + (tileSize - iconSize) / 2;
    return {
      id: icon.id,
      name: icon.n,
      src: icon.d,
      x,
      y,
      size: tileSize,
      radius,
      iconSize,
      iconRect: {
        x: iconX,
        y: iconY,
        width: iconSize,
        height: iconSize,
      },
    };
  });

  return {
    width,
    height,
    isMobile,
    renderDpr,
    title: {
      x: Math.round((width - Math.min(width - 48, isMobile ? 320 : 760)) / 2),
      y: top,
      width: Math.min(width - 48, isMobile ? 320 : 760),
      height: titleHeight,
      fontSize: titleFontSize,
      lineHeight: 1.08,
    },
    tiles,
    fractureOrigin: {
      x: width * 0.62,
      y: top + titleHeight * 0.38,
    },
  };
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

function sampleLayerArea(
  ctx: CanvasRenderingContext2D,
  layout: SceneLayout,
  area: SceneRect,
  kind: LayerKind,
  layer: LayerId,
  options: { step: number; patch: number; minAlpha: number; skipRect?: SceneRect },
) {
  const dpr = layout.renderDpr;
  const sx = Math.max(0, Math.floor(area.x * dpr));
  const sy = Math.max(0, Math.floor(area.y * dpr));
  const sw = Math.max(1, Math.ceil(area.width * dpr));
  const sh = Math.max(1, Math.ceil(area.height * dpr));
  const imageData = ctx.getImageData(sx, sy, sw, sh).data;
  const devStep = Math.max(2, Math.round(options.step * dpr));
  const devPatch = Math.max(devStep, Math.round(options.patch * dpr));
  const templates: ParticleTemplate[] = [];

  for (let py = 0; py < sh; py += devStep) {
    for (let px = 0; px < sw; px += devStep) {
      const localX = Math.min(sw - 1, px + Math.floor(devPatch / 2));
      const localY = Math.min(sh - 1, py + Math.floor(devPatch / 2));
      const alphaIndex = (localY * sw + localX) * 4 + 3;
      if (imageData[alphaIndex] < options.minAlpha) continue;

      const cssX = area.x + px / dpr + options.patch / 2;
      const cssY = area.y + py / dpr + options.patch / 2;
      if (options.skipRect && pointInRect(cssX, cssY, options.skipRect)) continue;

      templates.push({
        kind,
        layer,
        sx: sx + px,
        sy: sy + py,
        sw: Math.min(devPatch, sw - px),
        sh: Math.min(devPatch, sh - py),
        x: cssX,
        y: cssY,
        width: options.patch,
        height: options.patch,
      });
    }
  }

  return templates;
}

function thinTemplates(templates: ParticleTemplate[], budget: number) {
  if (templates.length <= budget) return templates;
  const stride = templates.length / budget;
  const filtered: ParticleTemplate[] = [];
  for (let i = 0; i < budget; i++) {
    filtered.push(templates[Math.floor(i * stride)]);
  }
  return filtered;
}

function buildPreparedScene(layout: SceneLayout, icons: LoadedIcon[]): PreparedScene {
  const dpr = layout.renderDpr;
  const width = Math.ceil(layout.width * dpr);
  const height = Math.ceil(layout.height * dpr);
  const layers: LayerCanvas = {
    title: createCanvas(width, height),
    tile: createCanvas(width, height),
    logo: createCanvas(width, height),
  };

  const titleCtx = layers.title.getContext('2d');
  const tileCtx = layers.tile.getContext('2d');
  const logoCtx = layers.logo.getContext('2d');

  if (!titleCtx || !tileCtx || !logoCtx) {
    throw new Error('Nao foi possivel inicializar os canvases da cena Thanos.');
  }

  [titleCtx, tileCtx, logoCtx].forEach((ctx) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  });

  drawTitleLayer(titleCtx, layout);

  const iconMap = new Map<string, LoadedIcon>(icons.map((icon) => [icon.id, icon]));
  layout.tiles.forEach((tile) => {
    drawPremiumTileSurface(tileCtx, tile);
    const icon = iconMap.get(tile.id);
    if (!icon) return;
    logoCtx.drawImage(
      icon.img,
      tile.iconRect.x,
      tile.iconRect.y,
      tile.iconRect.width,
      tile.iconRect.height,
    );
  });

  const titleTemplates = sampleLayerArea(titleCtx, layout, layout.title, 'title', 'title', {
    step: layout.isMobile ? 5 : 6,
    patch: layout.isMobile ? 5 : 6,
    minAlpha: 24,
  });

  const tileTemplates = layout.tiles.flatMap((tile) =>
    sampleLayerArea(
      tileCtx,
      layout,
      { x: tile.x, y: tile.y, width: tile.size, height: tile.size },
      'tile',
      'tile',
      {
        step: layout.isMobile ? 9 : 10,
        patch: layout.isMobile ? 9 : 10,
        minAlpha: 110,
        skipRect: {
          x: tile.iconRect.x - 8,
          y: tile.iconRect.y - 8,
          width: tile.iconRect.width + 16,
          height: tile.iconRect.height + 16,
        },
      },
    ),
  );

  const logoTemplates = layout.tiles.flatMap((tile) =>
    sampleLayerArea(logoCtx, layout, tile.iconRect, 'logo', 'logo', {
      step: layout.isMobile ? 5 : 6,
      patch: layout.isMobile ? 5 : 6,
      minAlpha: 24,
    }),
  );

  const particleBudget = layout.isMobile ? MOBILE_PARTICLE_BUDGET : DESKTOP_PARTICLE_BUDGET;
  const templates = thinTemplates(
    [...tileTemplates, ...logoTemplates, ...titleTemplates].sort(sortTemplates),
    particleBudget,
  );

  return { layout, layers, templates };
}

function instantiateParticle(layout: SceneLayout, template: ParticleTemplate): Particle {
  const dx = template.x - layout.fractureOrigin.x;
  const dy = template.y - layout.fractureOrigin.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;
  const tx = -ny;
  const ty = nx;
  const distanceNorm = clamp(distance / Math.hypot(layout.width, layout.height), 0, 1);

  const profile =
    template.kind === 'tile'
      ? {
          life: 0.56 + Math.random() * 0.14,
          impulse: 220 + Math.random() * 80,
          lift: -16 - Math.random() * 22,
          drag: 3.9,
          gravity: 560,
          spin: 3.2,
          swirl: 34,
          alphaHold: 0.12,
          shrink: 0.22,
        }
      : template.kind === 'logo'
        ? {
            life: 0.5 + Math.random() * 0.12,
            impulse: 240 + Math.random() * 90,
            lift: -24 - Math.random() * 28,
            drag: 4.6,
            gravity: 520,
            spin: 2.6,
            swirl: 26,
            alphaHold: 0.18,
            shrink: 0.28,
          }
        : {
            life: 0.42 + Math.random() * 0.08,
            impulse: 205 + Math.random() * 60,
            lift: -28 - Math.random() * 36,
            drag: 5.5,
            gravity: 440,
            spin: 1.5,
            swirl: 16,
            alphaHold: 0.1,
            shrink: 0.44,
          };

  const delayBase = 0.018 + distanceNorm * 0.14;
  const delayJitter = Math.random() * (template.kind === 'title' ? 0.02 : 0.035);
  const lateralJitter = (Math.random() - 0.5) * profile.swirl;
  const verticalJitter = (Math.random() - 0.5) * profile.swirl * 0.35;

  return {
    ...template,
    age: 0,
    delay: delayBase + delayJitter,
    life: profile.life,
    px: template.x,
    py: template.y,
    vx: nx * profile.impulse + tx * lateralJitter,
    vy: ny * (profile.impulse * 0.82) + ty * verticalJitter + profile.lift,
    nx,
    ny,
    tx,
    ty,
    rotation: 0,
    spin: (Math.random() - 0.5) * profile.spin,
    drag: profile.drag,
    gravity: profile.gravity,
    swirl: profile.swirl,
    alphaHold: profile.alphaHold,
    shrink: profile.shrink,
    noise: Math.random() * Math.PI * 2,
  };
}

function renderParticle(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  particle: Particle,
  source: HTMLCanvasElement,
  alpha: number,
  scale: number,
) {
  const cos = Math.cos(particle.rotation) * scale * dpr;
  const sin = Math.sin(particle.rotation) * scale * dpr;
  ctx.setTransform(cos, sin, -sin, cos, particle.px * dpr, particle.py * dpr);
  ctx.globalAlpha = alpha;
  ctx.drawImage(
    source,
    particle.sx,
    particle.sy,
    particle.sw,
    particle.sh,
    -particle.width / 2,
    -particle.height / 2,
    particle.width,
    particle.height,
  );
}

function PremiumTile({ tile, scenePhase }: { tile: TileLayout; scenePhase: ScenePhase }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: tile.x,
        top: tile.y,
        width: tile.size,
        height: tile.size,
        borderRadius: tile.radius,
        background: 'linear-gradient(180deg, #1A1A20 0%, #141419 48%, #101014 100%)',
        border: '1px solid #27272E',
        boxShadow:
          '0 18px 36px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -12px 28px rgba(0,0,0,0.22)',
        opacity: scenePhase === 'static' ? 1 : 0,
        transform: scenePhase === 'fracturing' ? 'translateY(-6px) scale(0.992)' : 'none',
        transition: 'opacity 140ms ease, transform 180ms ease',
        overflow: 'hidden',
        willChange: 'opacity, transform',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 1,
          borderRadius: tile.radius - 1,
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: tile.radius,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 44%)',
          opacity: 0.42,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '12%',
          right: '12%',
          bottom: '-24%',
          height: '42%',
          borderRadius: '999px',
          background:
            'radial-gradient(circle, rgba(232,93,48,0.2) 0%, rgba(232,93,48,0.06) 46%, transparent 74%)',
          filter: 'blur(12px)',
          opacity: 0.78,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 10,
          borderRadius: Math.max(10, tile.radius - 10),
          background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(0,0,0,0) 62%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          src={tile.src}
          alt={tile.name}
          width={tile.iconSize}
          height={tile.iconSize}
          sizes={`${tile.iconSize}px`}
          unoptimized
          style={{
            width: tile.iconSize,
            height: tile.iconSize,
            objectFit: 'contain',
            transform: 'translateY(-1px)',
          }}
        />
      </div>
    </div>
  );
}

function ThanosStaticLayer({
  layout,
  scenePhase,
}: {
  layout: SceneLayout | null;
  scenePhase: ScenePhase;
}) {
  if (!layout) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      <h2
        style={{
          position: 'absolute',
          left: layout.title.x,
          top: layout.title.y,
          width: layout.title.width,
          margin: 0,
          color: '#E0DDD8',
          fontFamily: F,
          fontSize: layout.title.fontSize,
          fontWeight: 800,
          lineHeight: layout.title.lineHeight,
          letterSpacing: '-0.045em',
          textAlign: 'center',
          textWrap: 'balance',
          textShadow: '0 1px 0 rgba(255,255,255,0.03), 0 18px 40px rgba(0,0,0,0.36)',
          opacity: scenePhase === 'static' ? 1 : 0,
          transform: scenePhase === 'fracturing' ? 'translateY(-6px) scale(0.992)' : 'none',
          transition: 'opacity 140ms ease, transform 180ms ease',
          willChange: 'opacity, transform',
        }}
      >
        {THANOS_TITLE}
      </h2>
      {layout.tiles.map((tile) => (
        <PremiumTile key={tile.id} tile={tile} scenePhase={scenePhase} />
      ))}
    </div>
  );
}

function ThanosOmniSales({ runToken }: { runToken: number }) {
  const [msgs, setMsgs] = useState<Record<ChannelKey, SalesMessage[]>>(EMPTY_MESSAGES);

  useEffect(() => {
    if (!runToken) return;
    let cancelled = false;
    setMsgs(EMPTY_MESSAGES);

    const run = async () => {
      for (const msg of SALES_FLOW) {
        if (cancelled) return;
        await wait(msg.f === '$' ? 900 : msg.f === 'a' ? 600 : 400);
        if (cancelled) return;
        setMsgs((prev) => ({ ...prev, [msg.ch]: [...prev[msg.ch], msg] }));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [runToken]);

  return (
    <div style={{ animation: 'thanosIn .8s cubic-bezier(.22,1,.36,1) both' }}>
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
              {(msgs[key] || []).slice(-3).map((msg, index) =>
                msg.f === '$' ? (
                  <div
                    key={`${msg.t}-${index}`}
                    style={{ textAlign: 'center', animation: 'thanosIn .2s ease both' }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#10B981', fontFamily: M }}>
                      {msg.t}
                    </span>
                  </div>
                ) : (
                  <div
                    key={`${msg.t}-${index}`}
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

export default function ThanosSection() {
  const stageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const [icons, setIcons] = useState<LoadedIcon[]>([]);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [inView, setInView] = useState(false);
  const [scenePhase, setScenePhase] = useState<ScenePhase>('static');
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const [salesRunToken, setSalesRunToken] = useState(0);

  const layout =
    bounds.width > 0 && bounds.height > 0 ? buildSceneLayout(bounds.width, bounds.height) : null;

  useEffect(() => {
    thanosLoadImages(THANOS_ICONS).then(setIcons);
  }, []);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);
      setBounds((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight },
      );
    });

    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { threshold: 0.22 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || bounds.width <= 0 || bounds.height <= 0 || icons.length !== THANOS_ICONS.length)
      return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prepared = buildPreparedScene(buildSceneLayout(bounds.width, bounds.height), icons);
    let alive = true;

    canvas.width = Math.ceil(prepared.layout.width * prepared.layout.renderDpr);
    canvas.height = Math.ceil(prepared.layout.height * prepared.layout.renderDpr);
    ctx.imageSmoothingEnabled = true;

    const animateFracture = () =>
      new Promise<void>((resolve) => {
        const particles = prepared.templates.map((template) =>
          instantiateParticle(prepared.layout, template),
        );
        const layers = prepared.layers;
        const margin = prepared.layout.isMobile ? 56 : 72;
        let previous = performance.now();

        const tick = (now: number) => {
          if (!alive) {
            resolve();
            return;
          }

          const dt = Math.min((now - previous) / 1000, 0.034);
          previous = now;
          let activeCount = 0;

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          for (const particle of particles) {
            particle.age += dt;
            const local = particle.age - particle.delay;

            if (local <= 0) {
              activeCount++;
              renderParticle(
                ctx,
                prepared.layout.renderDpr,
                particle,
                layers[particle.layer],
                1,
                1,
              );
              continue;
            }

            const progress = local / particle.life;
            if (progress >= 1) continue;

            const turbulence = Math.sin(particle.noise + particle.age * 8.5) * particle.swirl;
            const damping = Math.exp(-particle.drag * dt);
            const flow = (1 - progress) * 120;

            particle.vx += (particle.nx * flow + particle.tx * turbulence) * dt;
            particle.vy += (particle.ny * flow * 0.52 + particle.ty * turbulence * 0.22) * dt;
            particle.vy += particle.gravity * dt;
            particle.vx *= damping;
            particle.vy *= damping;
            particle.px += particle.vx * dt;
            particle.py += particle.vy * dt;
            particle.rotation += particle.spin * dt;

            if (
              particle.px < -margin ||
              particle.py < -margin ||
              particle.px > prepared.layout.width + margin ||
              particle.py > prepared.layout.height + margin
            ) {
              continue;
            }

            const alphaProgress =
              progress <= particle.alphaHold
                ? 0
                : (progress - particle.alphaHold) / (1 - particle.alphaHold);
            const alpha = alphaProgress <= 0 ? 1 : 1 - easeInQuad(alphaProgress);
            const scale = 1 - particle.shrink * easeOutCubic(progress);
            if (alpha <= 0.02 || scale <= 0.06) continue;

            activeCount++;
            renderParticle(
              ctx,
              prepared.layout.renderDpr,
              particle,
              layers[particle.layer],
              alpha,
              scale,
            );
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;

          if (activeCount > 0) {
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
        setOverlayVisible(false);
        setScenePhase('static');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        await wait(STATIC_HOLD_MS);
        if (!alive) return;

        setScenePhase('fracturing');
        setOverlayVisible(true);
        await animateFracture();
        if (!alive) return;

        setOverlayVisible(false);
        setScenePhase('hidden');
        await wait(PRE_REVEAL_MS);
        if (!alive) return;

        setShowReveal(true);
        await wait(SALES_DELAY_MS);
        if (!alive) return;

        setSalesRunToken((value) => value + 1);
        setShowSales(true);
        await wait(REVEAL_HOLD_MS);
        if (!alive) return;

        setShowReveal(false);
        setShowSales(false);
        await wait(360);
      }
    };

    runCycle();
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setOverlayVisible(false);
      setScenePhase('static');
      setShowReveal(false);
      setShowSales(false);
    };
  }, [bounds.height, bounds.width, icons, inView]);

  return (
    <div style={{ position: 'relative' }}>
      <section
        ref={stageRef}
        className="thanos-stage"
        style={{
          padding: '0 24px',
          maxWidth: 860,
          margin: '0 auto',
          position: 'relative',
          height: 'clamp(620px, 80vh, 720px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <ThanosStaticLayer layout={layout} scenePhase={scenePhase} />
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: overlayVisible ? 1 : 0,
            transition: 'opacity 120ms linear',
            pointerEvents: 'none',
            zIndex: 2,
            willChange: 'opacity',
          }}
        />
        {showReveal && (
          <div
            style={{
              position: 'relative',
              zIndex: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              padding: '0 24px',
              animation: 'thanosIn .82s cubic-bezier(.22,1,.36,1) both',
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(28px,4.5vw,40px)',
                fontWeight: 800,
                color: E,
                letterSpacing: '-.03em',
                textAlign: 'center',
                margin: 0,
                marginBottom: showSales ? 52 : 0,
              }}
            >
              O Kloel escala.
            </h2>
            {showSales && (
              <div style={{ width: '100%', maxWidth: 740 }}>
                <ThanosOmniSales runToken={salesRunToken} />
              </div>
            )}
          </div>
        )}
      </section>
      <style>{`
        @keyframes thanosIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
