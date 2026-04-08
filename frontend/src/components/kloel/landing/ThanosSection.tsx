'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { THANOS_ICONS } from './thanos-icons';

const F = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const E = '#E85D30';
const TITLE_COLOR = '#E0DDD8';
const THANOS_TITLE = 'Elas não escalam por você.';
const STATIC_HOLD_MS = 640;
const PRE_REVEAL_MS = 110;
const SALES_DELAY_MS = 760;
const REVEAL_HOLD_MS = 7200;
const DESKTOP_PARTICLE_BUDGET = 5200;
const MOBILE_PARTICLE_BUDGET = 3600;
const PHI = 1.618033988749895;

type LoadedIcon = (typeof THANOS_ICONS)[number] & { img: HTMLImageElement };
type ScenePhase = 'static' | 'fracturing' | 'hidden';
type LayerKind = 'title' | 'shell' | 'logo';
type LayerId = LayerKind;
type ChannelKey = 'wa' | 'ig' | 'fb' | 'em' | 'sms' | 'tt';

type SceneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ColorSample = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type TitleLayout = SceneRect & {
  fontSize: number;
  lineHeight: number;
};

type TileLayout = {
  id: string;
  name: string;
  src: string;
  index: number;
  x: number;
  y: number;
  size: number;
  radius: number;
  iconSize: number;
  iconRect: SceneRect;
  centerX: number;
  centerY: number;
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
  groupIndex: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: ColorSample;
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
  drag: number;
  gravity: number;
  lift: number;
  rotation: number;
  spin: number;
  turbulence: number;
  shrink: number;
  patchFadeStart: number;
  patchFadeEnd: number;
  dustSize: number;
  dustColor: string;
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
  const order: Record<LayerKind, number> = { shell: 0, logo: 1, title: 2 };
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

function drawShellSurface(ctx: CanvasRenderingContext2D, tile: TileLayout) {
  const shellGradient = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.size);
  shellGradient.addColorStop(0, '#1B1B22');
  shellGradient.addColorStop(0.46, '#141419');
  shellGradient.addColorStop(1, '#0F1014');

  ctx.save();
  drawRoundedRect(ctx, tile.x, tile.y, tile.size, tile.size, tile.radius);
  ctx.fillStyle = shellGradient;
  ctx.fill();
  ctx.strokeStyle = '#26272D';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawRoundedRect(ctx, tile.x + 1, tile.y + 1, tile.size - 2, tile.size - 2, tile.radius - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.stroke();

  ctx.clip();

  const topSheen = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.size * 0.45);
  topSheen.addColorStop(0, 'rgba(255,255,255,0.15)');
  topSheen.addColorStop(0.52, 'rgba(255,255,255,0.03)');
  topSheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topSheen;
  ctx.fillRect(tile.x, tile.y, tile.size, tile.size * 0.5);

  const emberGlow = ctx.createRadialGradient(
    tile.centerX,
    tile.y + tile.size * 1.02,
    0,
    tile.centerX,
    tile.y + tile.size * 1.02,
    tile.size * 0.8,
  );
  emberGlow.addColorStop(0, 'rgba(232,93,48,0.16)');
  emberGlow.addColorStop(0.55, 'rgba(232,93,48,0.06)');
  emberGlow.addColorStop(1, 'rgba(232,93,48,0)');
  ctx.fillStyle = emberGlow;
  ctx.fillRect(
    tile.x - tile.size * 0.08,
    tile.y + tile.size * 0.4,
    tile.size * 1.16,
    tile.size * 0.75,
  );

  const innerShade = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.size);
  innerShade.addColorStop(0, 'rgba(255,255,255,0.025)');
  innerShade.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = innerShade;
  ctx.fillRect(tile.x + 8, tile.y + 8, tile.size - 16, tile.size - 16);
  ctx.restore();
}

function drawTitleLayer(ctx: CanvasRenderingContext2D, layout: SceneLayout) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${layout.title.fontSize}px Sora, sans-serif`;
  ctx.fillStyle = TITLE_COLOR;
  ctx.shadowColor = 'rgba(0,0,0,0.34)';
  ctx.shadowBlur = 16;
  ctx.fillText(THANOS_TITLE, layout.width / 2, layout.title.y);
  ctx.shadowBlur = 0;
  ctx.fillText(THANOS_TITLE, layout.width / 2, layout.title.y);
  ctx.restore();
}

function buildSceneLayout(width: number, height: number): SceneLayout {
  const isMobile = width < 500;
  const iconSize = isMobile ? 56 : 80;
  const shellSize = iconSize + (isMobile ? 20 : 28);
  const shellRadius = isMobile ? 14 : 18;
  const cols = isMobile ? 2 : 5;
  const rows = Math.ceil(THANOS_ICONS.length / cols);
  const centerGapX = shellSize * (isMobile ? 1.6 : 1.55);
  const centerGapY = shellSize * (isMobile ? 1.15 : 1.5);
  const totalGridWidth = shellSize + (cols - 1) * centerGapX;
  const totalGridHeight = shellSize + (rows - 1) * centerGapY;
  const titleFontSize = isMobile ? Math.min(18, width * 0.045) : Math.min(38, width * 0.045);
  const titleHeight = Math.round(titleFontSize * 1.15);
  const titleGap = isMobile ? 28 : 40;
  const totalContentHeight = titleHeight + titleGap + totalGridHeight;
  const top = Math.max(20, Math.round((height - totalContentHeight) / 2));
  const gridX = Math.round((width - totalGridWidth) / 2);
  const gridY = top + titleHeight + titleGap;
  const renderDpr = Math.min(
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    isMobile ? 1.5 : 1.75,
  );

  const tiles = THANOS_ICONS.map((icon, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = Math.round(gridX + col * centerGapX);
    const y = Math.round(gridY + row * centerGapY);
    const centerX = x + shellSize / 2;
    const centerY = y + shellSize / 2;
    const iconX = Math.round(centerX - iconSize / 2);
    const iconY = Math.round(centerY - iconSize / 2);
    return {
      id: icon.id,
      name: icon.n,
      src: icon.d,
      index,
      x,
      y,
      size: shellSize,
      radius: shellRadius,
      iconSize,
      iconRect: {
        x: iconX,
        y: iconY,
        width: iconSize,
        height: iconSize,
      },
      centerX,
      centerY,
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
      lineHeight: 1.18,
    },
    tiles,
    fractureOrigin: {
      x: width * 0.62,
      y: top + titleHeight * 0.52,
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
  groupIndex: number,
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
      const colorIndex = (localY * sw + localX) * 4;
      const alpha = imageData[colorIndex + 3];
      if (alpha < options.minAlpha) continue;

      const cssX = area.x + px / dpr + options.patch / 2;
      const cssY = area.y + py / dpr + options.patch / 2;
      if (options.skipRect && pointInRect(cssX, cssY, options.skipRect)) continue;

      templates.push({
        kind,
        layer,
        groupIndex,
        sx: sx + px,
        sy: sy + py,
        sw: Math.min(devPatch, sw - px),
        sh: Math.min(devPatch, sh - py),
        x: cssX,
        y: cssY,
        width: Math.max(1.25, Math.min(options.patch, (sw - px) / dpr)),
        height: Math.max(1.25, Math.min(options.patch, (sh - py) / dpr)),
        color: {
          r: imageData[colorIndex],
          g: imageData[colorIndex + 1],
          b: imageData[colorIndex + 2],
          a: alpha / 255,
        },
      });
    }
  }

  return templates;
}

function limitTemplates(templates: ParticleTemplate[], budget: number) {
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
    shell: createCanvas(width, height),
    logo: createCanvas(width, height),
  };

  const titleCtx = layers.title.getContext('2d');
  const shellCtx = layers.shell.getContext('2d');
  const logoCtx = layers.logo.getContext('2d');

  if (!titleCtx || !shellCtx || !logoCtx) {
    throw new Error('Nao foi possivel inicializar os canvases do efeito Thanos.');
  }

  [titleCtx, shellCtx, logoCtx].forEach((ctx) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  });

  drawTitleLayer(titleCtx, layout);

  const iconMap = new Map<string, LoadedIcon>(icons.map((icon) => [icon.id, icon]));
  layout.tiles.forEach((tile) => {
    drawShellSurface(shellCtx, tile);
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

  const titleTemplates = sampleLayerArea(titleCtx, layout, layout.title, 'title', 'title', -1, {
    step: layout.isMobile ? 4 : 5,
    patch: layout.isMobile ? 4 : 5,
    minAlpha: 30,
  });

  const shellTemplates = layout.tiles.flatMap((tile) =>
    sampleLayerArea(
      shellCtx,
      layout,
      { x: tile.x, y: tile.y, width: tile.size, height: tile.size },
      'shell',
      'shell',
      tile.index,
      {
        step: layout.isMobile ? 6 : 7,
        patch: layout.isMobile ? 5 : 6,
        minAlpha: 85,
        skipRect: {
          x: tile.iconRect.x - 6,
          y: tile.iconRect.y - 6,
          width: tile.iconRect.width + 12,
          height: tile.iconRect.height + 12,
        },
      },
    ),
  );

  const logoTemplates = layout.tiles.flatMap((tile) =>
    sampleLayerArea(logoCtx, layout, tile.iconRect, 'logo', 'logo', tile.index, {
      step: layout.isMobile ? 4 : 5,
      patch: layout.isMobile ? 4 : 5,
      minAlpha: 24,
    }),
  );

  const particleBudget = layout.isMobile ? MOBILE_PARTICLE_BUDGET : DESKTOP_PARTICLE_BUDGET;
  const titleBudget = Math.round(particleBudget * 0.16);
  const shellBudget = Math.round(particleBudget * 0.34);
  const logoBudget = particleBudget - titleBudget - shellBudget;

  const templates = [
    ...limitTemplates(shellTemplates, shellBudget),
    ...limitTemplates(logoTemplates, logoBudget),
    ...limitTemplates(titleTemplates, titleBudget),
  ].sort(sortTemplates);

  return { layout, layers, templates };
}

function instantiateParticle(layout: SceneLayout, template: ParticleTemplate): Particle {
  const tile = template.groupIndex >= 0 ? layout.tiles[template.groupIndex] : null;
  const originX = tile ? tile.centerX : layout.fractureOrigin.x;
  const originY = tile ? tile.centerY : layout.fractureOrigin.y;
  let dx = template.x - originX;
  let dy = template.y - originY;
  let distance = Math.hypot(dx, dy);

  if (distance < 0.0001) {
    const angle = Math.random() * Math.PI * 2;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }

  const nx = dx / distance;
  const ny = dy / distance;
  const tx = -ny;
  const ty = nx;

  const profile =
    template.kind === 'shell'
      ? {
          life: 0.58 + Math.random() * 0.16,
          impulse: 138 + Math.random() * 36,
          drag: 4.8,
          gravity: 170,
          lift: -18 - Math.random() * 18,
          turbulence: 24 + Math.random() * 12,
          spin: 1.4,
          shrink: 0.44,
          patchFadeStart: 0.18,
          patchFadeEnd: 0.58,
          dustSize: 1.5 + Math.random() * 0.85,
        }
      : template.kind === 'logo'
        ? {
            life: 0.54 + Math.random() * 0.14,
            impulse: 152 + Math.random() * 44,
            drag: 5.2,
            gravity: 156,
            lift: -22 - Math.random() * 16,
            turbulence: 20 + Math.random() * 10,
            spin: 1.1,
            shrink: 0.52,
            patchFadeStart: 0.16,
            patchFadeEnd: 0.5,
            dustSize: 1.2 + Math.random() * 0.7,
          }
        : {
            life: 0.46 + Math.random() * 0.12,
            impulse: 112 + Math.random() * 28,
            drag: 5.9,
            gravity: 124,
            lift: -18 - Math.random() * 14,
            turbulence: 14 + Math.random() * 7,
            spin: 0.82,
            shrink: 0.66,
            patchFadeStart: 0.12,
            patchFadeEnd: 0.4,
            dustSize: 0.95 + Math.random() * 0.5,
          };

  const warmR = Math.round(122 + Math.random() * 36);
  const warmG = Math.round(82 + Math.random() * 26);
  const warmB = Math.round(50 + Math.random() * 18);

  const delay =
    template.kind === 'title'
      ? 0.038 +
        ((template.x - layout.title.x) / Math.max(layout.title.width, 1)) * 0.085 +
        (Math.abs(template.y - (layout.title.y + layout.title.height / 2)) /
          Math.max(layout.title.height, 1)) *
          0.025 +
        Math.random() * 0.018
      : 0.014 +
        ((template.groupIndex * PHI) % 1) * 0.17 +
        clamp(distance / Math.max(tile?.size ?? 1, 1), 0, 1) * 0.11 +
        Math.random() * (template.kind === 'logo' ? 0.018 : 0.03);

  const lateral = (Math.random() - 0.5) * profile.turbulence;
  const vertical = (Math.random() - 0.5) * profile.turbulence * 0.34;

  return {
    ...template,
    age: 0,
    delay,
    life: profile.life,
    px: template.x,
    py: template.y,
    vx: nx * profile.impulse + tx * lateral,
    vy: ny * profile.impulse * 0.76 + ty * vertical + profile.lift,
    nx,
    ny,
    tx,
    ty,
    drag: profile.drag,
    gravity: profile.gravity,
    lift: profile.lift,
    rotation: 0,
    spin: (Math.random() - 0.5) * profile.spin,
    turbulence: profile.turbulence,
    shrink: profile.shrink,
    patchFadeStart: profile.patchFadeStart,
    patchFadeEnd: profile.patchFadeEnd,
    dustSize: profile.dustSize,
    dustColor: `rgb(${warmR}, ${warmG}, ${warmB})`,
    noise: Math.random() * Math.PI * 2,
  };
}

function renderPatchParticle(
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

function renderDustParticle(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  particle: Particle,
  alpha: number,
  progress: number,
) {
  const size = particle.dustSize * (1 - progress * 0.28);
  const trailX = particle.px - particle.vx * 0.012;
  const trailY = particle.py - particle.vy * 0.012;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = particle.dustColor;
  ctx.fillRect(
    (particle.px - size / 2) * dpr,
    (particle.py - size / 2) * dpr,
    size * dpr,
    size * dpr,
  );
  if (alpha > 0.1) {
    const trailSize = size * 0.82;
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillRect(
      (trailX - trailSize / 2) * dpr,
      (trailY - trailSize / 2) * dpr,
      trailSize * dpr,
      trailSize * dpr,
    );
  }
}

function HybridShellTile({ tile, scenePhase }: { tile: TileLayout; scenePhase: ScenePhase }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: tile.x,
        top: tile.y,
        width: tile.size,
        height: tile.size,
        borderRadius: tile.radius,
        background: 'linear-gradient(180deg, #1B1B22 0%, #141419 46%, #0F1014 100%)',
        border: '1px solid #26272D',
        boxShadow:
          '0 18px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -14px 22px rgba(0,0,0,0.2)',
        opacity: scenePhase === 'static' ? 1 : 0,
        transform: scenePhase === 'fracturing' ? 'translateY(-3px) scale(0.994)' : 'none',
        transition: 'opacity 90ms linear, transform 140ms ease',
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
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 40%, rgba(255,255,255,0) 64%)',
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
            'radial-gradient(circle, rgba(232,93,48,0.2) 0%, rgba(232,93,48,0.06) 44%, transparent 74%)',
          filter: 'blur(12px)',
          opacity: 0.72,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 8,
          borderRadius: Math.max(8, tile.radius - 8),
          background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(0,0,0,0.08) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
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
          color: TITLE_COLOR,
          fontFamily: F,
          fontSize: layout.title.fontSize,
          fontWeight: 800,
          lineHeight: layout.title.lineHeight,
          letterSpacing: '-0.045em',
          textAlign: 'center',
          textShadow: '0 1px 0 rgba(255,255,255,0.03), 0 18px 38px rgba(0,0,0,0.34)',
          opacity: scenePhase === 'static' ? 1 : 0,
          transform: scenePhase === 'fracturing' ? 'translateY(-3px) scale(0.995)' : 'none',
          transition: 'opacity 90ms linear, transform 140ms ease',
          willChange: 'opacity, transform',
        }}
      >
        {THANOS_TITLE}
      </h2>
      {layout.tiles.map((tile) => (
        <HybridShellTile key={tile.id} tile={tile} scenePhase={scenePhase} />
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
        const margin = prepared.layout.isMobile ? 56 : 72;
        let previous = performance.now();

        const tick = (now: number) => {
          if (!alive) {
            resolve();
            return;
          }

          const dt = Math.min((now - previous) / 1000, 0.033);
          previous = now;
          let activeCount = 0;

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          for (const particle of particles) {
            particle.age += dt;
            const local = particle.age - particle.delay;

            if (local <= 0) {
              activeCount++;
              renderPatchParticle(
                ctx,
                prepared.layout.renderDpr,
                particle,
                prepared.layers[particle.layer],
                particle.color.a,
                1,
              );
              continue;
            }

            const progress = local / particle.life;
            if (progress >= 1) continue;

            const turbulence = Math.sin(particle.noise + particle.age * 10.5) * particle.turbulence;
            const flow = (1 - progress) * 34;
            const damping = Math.exp(-particle.drag * dt);
            particle.vx += (particle.nx * flow + particle.tx * turbulence) * dt;
            particle.vy += (particle.ny * flow * 0.72 + particle.ty * turbulence * 0.34) * dt;
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

            let patchAlpha = particle.color.a;
            if (progress > particle.patchFadeStart) {
              const patchFadeT = clamp(
                (progress - particle.patchFadeStart) /
                  Math.max(particle.patchFadeEnd - particle.patchFadeStart, 0.001),
                0,
                1,
              );
              patchAlpha = particle.color.a * (1 - easeOutCubic(patchFadeT));
            }

            const dustStart = particle.patchFadeStart * 0.78;
            const dustT = clamp((progress - dustStart) / Math.max(1 - dustStart, 0.001), 0, 1);
            const dustAlpha = dustT <= 0 ? 0 : 0.92 * (1 - easeInQuad(dustT));
            const scale = 1 - particle.shrink * easeOutCubic(Math.min(progress, 0.92));

            if (patchAlpha > 0.02 && scale > 0.08) {
              activeCount++;
              renderPatchParticle(
                ctx,
                prepared.layout.renderDpr,
                particle,
                prepared.layers[particle.layer],
                patchAlpha,
                scale,
              );
            }

            if (dustAlpha > 0.04) {
              activeCount++;
              renderDustParticle(ctx, prepared.layout.renderDpr, particle, dustAlpha, progress);
            }
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
            transition: 'opacity 90ms linear',
            pointerEvents: 'none',
            zIndex: 2,
            willChange: 'opacity',
          }}
        />
        {showReveal && (
          <div
            className="thanos-reveal"
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
