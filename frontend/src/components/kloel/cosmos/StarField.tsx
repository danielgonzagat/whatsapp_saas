'use client';

import { useRef, useEffect } from 'react';
import { colors } from '@/lib/design-tokens';

interface StarFieldProps {
  density?: number;
}

export function StarField({ density = 100 }: StarFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.parentElement?.clientWidth || window.innerWidth;
      const h = canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = w;
      canvas.height = h;

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Subtle nebula glows
      const nebulae = [
        { x: w * 0.2, y: h * 0.3, r: Math.max(w, h) * 0.4, color: colors.accent.webb, opacity: 0.012 },
        { x: w * 0.7, y: h * 0.6, r: Math.max(w, h) * 0.35, color: '#7B5EA7', opacity: 0.008 },
        { x: w * 0.5, y: h * 0.15, r: Math.max(w, h) * 0.3, color: colors.accent.gold, opacity: 0.018 },
      ];

      for (const neb of nebulae) {
        const grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
        grad.addColorStop(0, `rgba(${hexToRgb(neb.color)}, ${neb.opacity})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Static star dots (deterministic, not random)
      for (let i = 0; i < density; i++) {
        // Deterministic positioning using golden ratio-based distribution
        const phi = 1.618033988749895;
        const px = ((i * phi * 137.508) % w);
        const py = ((i * phi * 227.13 + i * 31.7) % h);
        const size = 0.6 + ((i * 7.3) % 0.8);
        const opacity = 0.04 + ((i * 13.7) % 0.08);

        // Some stars have faint Webb blue or gold tint
        let starColor: string;
        if (i % 7 === 0) {
          starColor = `rgba(${hexToRgb(colors.accent.webb)}, ${opacity})`;
        } else if (i % 11 === 0) {
          starColor = `rgba(${hexToRgb(colors.accent.gold)}, ${opacity})`;
        } else {
          starColor = `rgba(255, 255, 255, ${opacity})`;
        }

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = starColor;
        ctx.fill();
      }
    };

    draw();

    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export default StarField;
