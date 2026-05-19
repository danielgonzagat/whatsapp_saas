import { describe, expect, it } from 'vitest';

import {
  blendSquare,
  buildLegacyLayout,
  captureParticles,
  drawScene,
  isParticleOffscreen,
  particleNoise,
  updateParticleMotion,
} from '../ThanosSection';
import { THANOS_ICONS } from '../thanos-icons';

function makeContext(data?: Uint8ClampedArray, width = 8, height = 8) {
  const calls: string[] = [];
  return Object.assign(Object.create(null) as CanvasRenderingContext2D & { calls: string[] }, {
    calls,
    setTransform: () => calls.push('setTransform'),
    clearRect: () => calls.push('clearRect'),
    fillText: () => calls.push('fillText'),
    beginPath: () => calls.push('beginPath'),
    roundRect: () => calls.push('roundRect'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
    drawImage: () => calls.push('drawImage'),
    getImageData: () => ({ data: data ?? new Uint8ClampedArray(width * height * 4) }),
  });
}

function makeParticle() {
  return {
    x: 10,
    y: 10,
    vx: 0,
    vy: 0,
    dvx: 1,
    dvy: -0.5,
    size: 2,
    r: 10,
    g: 20,
    b: 30,
    a: 1,
    tr: 100,
    tg: 90,
    tb: 80,
    life: 1,
    decay: 0.01,
    shrink: 0.99,
    delaySec: 0,
    ageSec: 1,
    ramp: 0,
  };
}

describe('ThanosSection particle physics', () => {
  it('builds responsive legacy grid layouts', () => {
    expect(buildLegacyLayout(360, 720, 2)).toMatchObject({ isMobile: true, cols: 2, rows: 5 });
    expect(buildLegacyLayout(900, 720, 1)).toMatchObject({ isMobile: false, cols: 5, rows: 2 });
  });

  it('draws the source scene with real icons before capture', () => {
    const layout = buildLegacyLayout(900, 720, 1);
    const icons = THANOS_ICONS.slice(0, 2).map((icon) => ({ ...icon, img: new Image() }));
    const ctx = makeContext();

    drawScene(ctx, layout, icons);

    expect(ctx.calls).toContain('fillText');
    expect(ctx.calls.filter((call) => call === 'drawImage')).toHaveLength(2);
  });

  it('samples colored pixels into delayed particles', () => {
    const layout = buildLegacyLayout(8, 8, 1);
    const data = new Uint8ClampedArray(8 * 8 * 4);
    data.set([37, 211, 102, 255], 0);

    const particles = captureParticles(makeContext(data), layout);

    expect(particles[0]).toMatchObject({ x: 0, y: 0, r: 37, g: 211, b: 102, a: 1 });
    expect(particles[0]?.delaySec).toBeGreaterThanOrEqual(0);
  });

  it('blends particle squares over empty and occupied pixels', () => {
    const buffer = new Uint8ClampedArray(4 * 4 * 4);
    blendSquare(buffer, 4, 4, 1, 1, 1, 100, 50, 25, 0.5);
    blendSquare(buffer, 4, 4, 1, 1, 1, 200, 150, 100, 0.5);

    expect(buffer[20]).toBeGreaterThan(100);
    expect(buffer[23]).toBeGreaterThan(127);
  });

  it('updates organic drift and offscreen checks', () => {
    const particle = makeParticle();
    updateParticleMotion(particle, 1 / 30, 2);

    expect(particle.life).toBeLessThan(1);
    expect(particle.size).toBeLessThan(2);
    expect(isParticleOffscreen(particle, buildLegacyLayout(900, 720, 1))).toBe(false);
  });

  it('keeps deterministic noise stable for repeatable particles', () => {
    expect(particleNoise(12, 18, 99)).toBe(particleNoise(12, 18, 99));
    expect(particleNoise(12, 18, 99)).not.toBe(particleNoise(12, 18, 100));
  });
});
