import { THANOS_ICONS } from './thanos-icons';
import { THANOS_TITLE } from './thanos-section.const';

const PHI = 1.618033988749895;

export interface LegacyLayout {
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
  centers: Array<{ x: number; y: number; idx: number }>;
}

export interface LoadedIcon {
  id: string;
  n: string;
  d: string;
  img: HTMLImageElement;
}

export interface Particle {
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
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function buildLegacyLayout(width: number, height: number, dpr: number): LegacyLayout {
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

export function drawScene(
  ctx: CanvasRenderingContext2D,
  layout: LegacyLayout,
  icons: LoadedIcon[],
) {
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
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.beginPath();
    const rx = center.x - layout.containerSize / 2;
    const ry = center.y - layout.containerSize / 2;
    ctx.roundRect(rx, ry, layout.containerSize, layout.containerSize, layout.containerRadius);
    ctx.fill();

    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = 'rgb(255, 255, 255)';
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

export async function thanosLoadImages(icons: typeof THANOS_ICONS): Promise<LoadedIcon[]> {
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

export function particleNoise(px: number, py: number, salt: number): number {
  let value = (Math.imul(px + 1, 374_761_393) ^ Math.imul(py + 1, 668_265_263) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 2_246_822_519) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3_266_489_917) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_296;
}

export function captureParticles(ctx: CanvasRenderingContext2D, layout: LegacyLayout) {
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
      const ang = particleNoise(px, py, 0x9e3779b9) * 6.28;
      const spd = 0.4 + nd * 0.015 + particleNoise(px, py, 0x85ebca6b) * 0.6;
      const vx0 = Math.cos(ang) * spd;
      const vy0 = Math.sin(ang) * spd;
      const goldenPhase = (nearest.idx * PHI) % 1;
      const delayFrames = Math.max(
        0,
        Math.round(goldenPhase * 34 + particleNoise(px, py, 0xc2b2ae35) * 21),
      );

      particles.push({
        x,
        y,
        vx: vx0 * 0.01,
        vy: vy0 * 0.01,
        dvx: vx0,
        dvy: vy0,
        size: layout.isMobile
          ? 0.3 + particleNoise(px, py, 0x27d4eb2f) * 0.6
          : 0.4 + particleNoise(px, py, 0x27d4eb2f) * 1.2,
        r: data[index],
        g: data[index + 1],
        b: data[index + 2],
        a: data[index + 3] / 255,
        tr: 125 + particleNoise(px, py, 0x165667b1) * 35,
        tg: 85 + particleNoise(px, py, 0xd3a2646c) * 25,
        tb: 50 + particleNoise(px, py, 0xfd7046c5) * 20,
        life: 1,
        decay: 0.0046 + nd * 0.00005 + particleNoise(px, py, 0xb55a4f09) * 0.0024,
        shrink: 0.9953 + particleNoise(px, py, 0x9e3779b1) * 0.002,
        delaySec: delayFrames / 60,
        ageSec: 0,
        ramp: 0,
      });
    }
  }

  return particles;
}

export function blendSquare(
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

export function updateParticleMotion(particle: Particle, _dtSec: number, frameScale: number) {
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

export function isParticleOffscreen(particle: Particle, layout: LegacyLayout): boolean {
  return (
    particle.x + particle.size < -8 ||
    particle.y + particle.size < -8 ||
    particle.x > layout.width + 8 ||
    particle.y > layout.height + 8
  );
}
