'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/kloel/auth/auth-provider';

// ════════════════════════════════════════════
// HEARTBEAT ECG — the soul of Monitor
// Real monitor. Cursor draws live. Erases behind. Sharp. Irregular.
// ════════════════════════════════════════════

function Heartbeat() {
  const cv = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number>(0);
  const pos = useRef(0);
  const buffer = useRef<Float32Array | null>(null);
  const beatIdx = useRef(0);
  const cyclePos = useRef(0);
  const beats = useRef<number[][]>([]);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    function makeBeat(): number[] {
      const spike = 22 + Math.random() * 20;
      const dip = 6 + Math.random() * 14;
      const tH = 3 + Math.random() * 6;
      const pre = 2 + Math.random() * 4;
      const rest = 35 + Math.floor(Math.random() * 25);
      const spikeW = 4 + Math.floor(Math.random() * 4);
      const tPos = 20 + Math.floor(Math.random() * 8);
      const tW = 12 + Math.floor(Math.random() * 6);
      const total = rest + 6 + spikeW * 2 + 8 + tW + 15;

      const pts: number[] = [];
      for (let i = 0; i < total; i++) {
        if (i < rest) {
          pts.push((Math.random() - 0.5) * 0.3);
        } else if (i < rest + 3) {
          pts.push(-((i - rest) / 3) * pre);
        } else if (i < rest + 3 + spikeW) {
          pts.push(-pre - ((i - rest - 3) / spikeW) * (spike - pre));
        } else if (i < rest + 3 + spikeW * 2) {
          pts.push(-spike + ((i - rest - 3 - spikeW) / spikeW) * (spike + dip));
        } else if (i < rest + 3 + spikeW * 2 + 8) {
          pts.push(dip - ((i - rest - 3 - spikeW * 2) / 8) * dip);
        } else {
          const tI = i - (rest + 3 + spikeW * 2 + 8);
          if (tI >= tPos && tI < tPos + tW) {
            const t = (tI - tPos) / tW;
            const tri = t < 0.5 ? (t / 0.5) : (1 - (t - 0.5) / 0.5);
            pts.push(-tri * tH);
          } else {
            pts.push((Math.random() - 0.5) * 0.3);
          }
        }
      }
      return pts;
    }

    for (let i = 0; i < 30; i++) beats.current.push(makeBeat());

    let barW = 0;
    let startX = 0;

    function tick() {
      const w = c!.offsetWidth;
      const h = c!.offsetHeight;
      c!.width = w * dpr;
      c!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      barW = Math.min(Math.floor(w * 0.65), 500);
      startX = Math.floor((w - barW) / 2);
      const cy = h / 2 + 2;

      if (!buffer.current || buffer.current.length !== barW) {
        buffer.current = new Float32Array(barW);
        pos.current = 0;
      }

      // Advance 2 pixels per frame
      for (let step = 0; step < 2; step++) {
        const beat = beats.current[beatIdx.current % beats.current.length];
        const cp = Math.floor(cyclePos.current);

        if (cp < beat.length) {
          buffer.current[pos.current] = beat[cp];
        } else {
          buffer.current[pos.current] = (Math.random() - 0.5) * 0.3;
        }

        cyclePos.current++;
        if (cyclePos.current >= beat.length) {
          cyclePos.current = 0;
          beatIdx.current++;
        }

        pos.current++;
        if (pos.current >= barW) pos.current = 0;
      }

      // Erase zone ahead of cursor
      const eraseLen = 25;
      for (let i = 1; i <= eraseLen; i++) {
        const idx = (pos.current + i) % barW;
        buffer.current[idx] = NaN;
      }

      // Draw the buffer
      function drawSegment(from: number, to: number) {
        let penDown = false;
        for (let i = from; i < to; i++) {
          const val = buffer.current![i];
          if (isNaN(val)) {
            penDown = false;
            continue;
          }
          const x = startX + i;
          const y = cy + val;
          if (!penDown) {
            ctx!.moveTo(x, y);
            penDown = true;
          } else {
            ctx!.lineTo(x, y);
          }
        }
      }

      ctx!.beginPath();
      drawSegment(0, barW);

      const grad = ctx!.createLinearGradient(startX, 0, startX + barW, 0);
      grad.addColorStop(0, 'rgba(232,93,48,0)');
      grad.addColorStop(0.05, 'rgba(232,93,48,0.8)');
      grad.addColorStop(0.12, 'rgba(232,93,48,1)');
      grad.addColorStop(0.88, 'rgba(232,93,48,1)');
      grad.addColorStop(0.95, 'rgba(232,93,48,0.8)');
      grad.addColorStop(1, 'rgba(232,93,48,0)');

      ctx!.strokeStyle = grad;
      ctx!.lineWidth = 2;
      ctx!.lineJoin = 'bevel';
      ctx!.stroke();

      // Glow behind the line
      ctx!.save();
      ctx!.globalAlpha = 0.08;
      ctx!.filter = 'blur(5px)';
      ctx!.lineWidth = 8;
      ctx!.strokeStyle = '#E85D30';
      ctx!.beginPath();
      drawSegment(0, barW);
      ctx!.stroke();
      ctx!.restore();

      // Cursor dot — bright
      const dotX = startX + pos.current;
      const dotVal = buffer.current[pos.current];
      if (!isNaN(dotVal)) {
        const dotY = cy + dotVal;
        ctx!.beginPath();
        ctx!.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx!.fillStyle = '#E85D30';
        ctx!.fill();

        const glow = ctx!.createRadialGradient(dotX, dotY, 0, dotX, dotY, 10);
        glow.addColorStop(0, 'rgba(232,93,48,0.4)');
        glow.addColorStop(1, 'rgba(232,93,48,0)');
        ctx!.beginPath();
        ctx!.arc(dotX, dotY, 10, 0, Math.PI * 2);
        ctx!.fillStyle = glow;
        ctx!.fill();
      }

      raf.current = requestAnimationFrame(tick);
    }

    tick();
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <canvas
      ref={cv}
      style={{
        position: 'absolute',
        bottom: '15%',
        left: 0,
        width: '100%',
        height: 90,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}

// ════════════════════════════════════════════
// SEND ICON
// ════════════════════════════════════════════

function SendIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ════════════════════════════════════════════
// HOME SCREEN
// ════════════════════════════════════════════

interface HomeScreenProps {
  onSendMessage?: (text: string) => void;
}

export function HomeScreen({ onSendMessage }: HomeScreenProps) {
  const { userName } = useAuth();
  const [input, setInput] = useState('');
  const router = useRouter();

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    if (onSendMessage) {
      onSendMessage(input.trim());
    }
    setInput('');
    router.push(`/chat?q=${encodeURIComponent(input.trim())}`);
  }, [input, onSendMessage, router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        position: 'relative',
        background: '#0A0A0C',
      }}
    >
      {/* Heartbeat ECG — the soul */}
      <Heartbeat />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          maxWidth: 620,
          padding: '0 24px',
        }}
      >
        {/* KLOEL eyebrow */}
        <div style={{ animation: 'fadeIn 1s ease both' }}>
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: '#E85D30',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 28,
            }}
          >
            KLOEL
          </p>

          {/* Manifesto */}
          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 36,
              fontWeight: 700,
              color: '#E0DDD8',
              lineHeight: 1.3,
              margin: '0 0 48px',
              letterSpacing: '-0.02em',
            }}
          >
            O Marketing morreu{' '}
            <span style={{ color: '#E85D30' }}>Digital</span>
            <br />
            e ressuscitou{' '}
            <span style={{ color: '#E85D30' }}>Artificial.</span>
          </h1>
        </div>

        {/* Input */}
        <div style={{ animation: 'fadeIn 1s ease 400ms both' }}>
          <div
            style={{
              background: '#111113',
              border: '1px solid #222226',
              borderRadius: 6,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Pergunte qualquer coisa..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#E0DDD8',
                fontSize: 14,
                fontFamily: "'Sora', sans-serif",
              }}
            />
            <button
              onClick={handleSubmit}
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                background: input.trim() ? '#E85D30' : '#19191C',
                border: 'none',
                cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: input.trim() ? '#0A0A0C' : '#3A3A3F',
                transition: 'all 150ms ease',
              }}
            >
              <SendIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
