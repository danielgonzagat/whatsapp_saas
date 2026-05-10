'use client';
import { useRef, useEffect, useState } from 'react';
import { secureRandomFloat } from '@/lib/secure-random';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { MONO, BG_CARD, BORDER, EMBER } from './MarketingShared.channels';

function drawNeuralFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  frame: number,
): void {
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.15 + Math.sin(frame * 0.02 + i) * 0.1;
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 2) {
      const spike = secureRandomFloat() > 0.97 ? (secureRandomFloat() - 0.5) * h * 0.6 : 0;
      const y = h / 2 + Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (h * 0.25 + i * 2) + spike;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function NP({ w, h, color = EMBER }: { w: number; h: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let raf: number;
    let visible = true;
    const obs = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0 },
    );
    obs.observe(c);
    const draw = () => {
      if (!visible) return;
      drawNeuralFrame(ctx, w, h, color, frame);
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [w, h, color]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }}
    />
  );
}

export function Ticker({ items }: { items: string[] }) {
  const text = items.join('  ///  ');
  return (
    <div
      style={{
        overflow: 'hidden',
        width: '100%',
        background: BG_CARD,
        borderRadius: 6,
        padding: '8px 0',
        border: `1px solid ${BORDER}`,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          animation: 'mktTickerScroll 30s linear infinite',
          fontFamily: MONO,
          fontSize: 12,
          color: EMBER,
          opacity: 0.8,
        }}
      >
        {text}
        {kloelT(`&nbsp;&nbsp;&nbsp;///&nbsp;&nbsp;&nbsp;`)}
        {text}
      </div>
    </div>
  );
}

export function LiveStream({ msgs, color = EMBER }: { msgs: string[]; color?: string }) {
  const [feed, setFeed] = useState<Array<{ id: string; text: string }>>([]);
  const idx = useRef(0);
  useEffect(() => {
    if (msgs.length === 0 || (msgs.length === 1 && msgs[0] === 'Aguardando mensagens...')) {
      return;
    }
    const iv = setInterval(() => {
      setFeed((p) =>
        [
          { id: `feed-${Date.now()}-${idx.current}`, text: msgs[idx.current % msgs.length] },
          ...p,
        ].slice(0, 8),
      );
      idx.current++;
    }, 2000);
    return () => clearInterval(iv);
  }, [msgs]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {feed.map((entry, i) => (
        <div
          key={entry.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: MONO,
            fontSize: 12,
            color: 'var(--app-text-primary)',
            padding: '6px 10px',
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            opacity: 1 - i * 0.1,
          }}
        >
          <NP w={24} h={12} color={color} />
          <span>{entry.text}</span>
        </div>
      ))}
    </div>
  );
}

export function ConnBadge({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontFamily: MONO,
        color: connected ? colors.semantic.success : '#ef4444',
        background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
        padding: '2px 8px',
        borderRadius: 99,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: connected ? colors.semantic.success : '#ef4444',
          animation: connected ? 'mktPulse 2s infinite' : 'none',
        }}
      />
      {connected ? 'Conectado' : 'Desconectado'}
    </span>
  );
}
