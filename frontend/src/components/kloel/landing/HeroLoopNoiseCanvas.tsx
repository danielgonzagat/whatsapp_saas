'use client';
import { useEffect, useRef } from 'react';
import { secureRandomFloat } from '@/lib/secure-random';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export function useHeroNoiseCanvasRef() {
  return useRef<HTMLCanvasElement | null>(null);
}

export function useHeroNoiseCanvas(
  noiseRef: ReturnType<typeof useHeroNoiseCanvasRef>,
  glitchOn: boolean,
) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const glitchRef = useRef<boolean>(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    glitchRef.current = glitchOn;
  }, [glitchOn, prefersReducedMotion]);

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
    let raf: number;
    const drawN = () => {
      if (!glitchRef.current) {
        ctx.clearRect(0, 0, 600, 120);
        raf = requestAnimationFrame(drawN);
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
      raf = requestAnimationFrame(drawN);
    };
    raf = requestAnimationFrame(drawN);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [prefersReducedMotion, noiseRef]);
}

export function HeroNoiseCanvas({
  noiseRef,
  glitchOn,
}: {
  noiseRef: ReturnType<typeof useHeroNoiseCanvasRef>;
  glitchOn: boolean;
}) {
  return (
    <canvas
      ref={noiseRef}
      style={{
        position: 'absolute',
        inset: -20,
        width: 'calc(100% + 40px)',
        height: 'calc(100% + 40px)',
        pointerEvents: 'none',
        zIndex: 3,
        opacity: glitchOn ? 0.55 : 0,
        mixBlendMode: 'screen',
      }}
    />
  );
}
