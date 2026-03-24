'use client';

import { useRef, useEffect, useState, useCallback, FormEvent, ChangeEvent } from 'react';
import { colors, typography } from '@/lib/design-tokens';

interface OrbitalInputProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  placeholder?: string;
}

export function OrbitalInput({ value, onChange, onSubmit, placeholder }: OrbitalInputProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let angle = 0;
    const trailLength = 25;
    const trail: { x: number; y: number }[] = [];

    const render = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w;
      canvas.height = h;

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const rx = (w / 2) - 12;
      const ry = (h / 2) - 6;

      // Subtle elliptical orbit line
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(78, 122, 224, 0.07)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Calculate particle position
      angle += 0.015;
      const px = cx + rx * Math.cos(angle);
      const py = cy + ry * Math.sin(angle);

      trail.push({ x: px, y: py });
      if (trail.length > trailLength) trail.shift();

      // Draw trail
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i];
        const opacity = (i / trail.length) * 0.4;
        const size = (i / trail.length) * 2.5;
        ctx.beginPath();
        ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(78, 122, 224, ${opacity})`;
        ctx.fill();
      }

      // Glowing particle
      const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, 12);
      glowGrad.addColorStop(0, 'rgba(78, 122, 224, 0.3)');
      glowGrad.addColorStop(1, 'rgba(78, 122, 224, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(px - 12, py - 12, 24, 24);

      // Core particle dot
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.accent.webb;
      ctx.fill();

      animRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (value.trim()) onSubmit();
    },
    [value, onSubmit]
  );

  const hasValue = value.trim().length > 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        maxWidth: 680,
        padding: 24,
      }}
    >
      {/* Orbital canvas overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          width: '100%',
          height: '100%',
        }}
      />

      {/* Inner input area */}
      <form onSubmit={handleSubmit}>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: colors.background.nebula,
            border: `1px solid ${focused ? 'rgba(78, 122, 224, 0.3)' : colors.border.space}`,
            borderRadius: 16,
            padding: '14px 20px',
            transition: 'border-color 250ms ease, box-shadow 250ms ease',
            boxShadow: focused ? '0 0 30px rgba(78, 122, 224, 0.06)' : 'none',
          }}
        >
          <input
            type="text"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: colors.text.starlight,
              fontFamily: typography.fontFamily.sans,
              fontSize: 15,
              lineHeight: '1.5',
            }}
          />

          <button
            type="submit"
            disabled={!hasValue}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: hasValue ? 'pointer' : 'default',
              background: hasValue ? colors.accent.webb : colors.background.stellar,
              boxShadow: hasValue ? '0 0 16px rgba(78, 122, 224, 0.3)' : 'none',
              transition: 'all 250ms ease',
              flexShrink: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{ marginLeft: 1 }}
            >
              <path
                d="M1 7h11M8 3l4 4-4 4"
                stroke={hasValue ? '#fff' : colors.text.dust}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

export default OrbitalInput;
