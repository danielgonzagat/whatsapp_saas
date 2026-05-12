import { useRef, useEffect } from 'react';
import { secureRandomFloat } from '@/lib/secure-random';
import { V } from '../analytics.design-tokens';

export function NeuroPulse({ color = V.em, w = 120, h = 24 }: { color?: string; w?: number; h?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    if (!c) {return;}
    const ctx = c.getContext('2d');
    if (!ctx) {return;}
    c.width = w * 2;
    c.height = h * 2;
    ctx.scale(2, 2);
    let f = 0;
    let raf: number;
    let visible = true;
    const obs = new IntersectionObserver(
      ([e]) => { visible = e.isIntersecting; if (visible) {raf = requestAnimationFrame(draw);} },
      { threshold: 0 },
    );
    obs.observe(c);
    const draw = () => {
      if (!visible) {return;}
      ctx.clearRect(0, 0, w, h);
      for (let layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.2 + layer * 0.2;
        for (let x = 0; x < w; x += 2) {
          const spike = secureRandomFloat() > 0.97 ? (secureRandomFloat() - 0.5) * h * 0.5 : 0;
          const y = h / 2 + Math.sin(x * 0.04 + f * 0.03 + layer * 1.5) * (h * 0.25 + layer * 2) + spike;
          if (x === 0) {ctx.moveTo(x, y);}
          else {ctx.lineTo(x, y);}
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      f++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [color, w, h]);
  return <canvas ref={cv} style={{ width: w, height: h, display: 'block', opacity: 0.6 }} />;
}
