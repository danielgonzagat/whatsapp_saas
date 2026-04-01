'use client';

import { useRef, useEffect, type CSSProperties } from 'react';

interface HeartbeatProps {
  mini?: boolean;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}

export function Heartbeat({
  mini = false,
  width,
  height,
  style,
}: HeartbeatProps) {
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

    const scaleFactor = mini ? 0.3 : 1;
    const noiseAmp = mini ? 0.1 : 0.3;
    const eraseLen = mini ? 10 : 25;
    const dotRadius = mini ? 1.5 : 3;
    const lineW = mini ? 1.5 : 2;

    function makeBeat(): number[] {
      const spike = (22 + Math.random() * 20) * scaleFactor;
      const dip = (6 + Math.random() * 14) * scaleFactor;
      const tH = (3 + Math.random() * 6) * scaleFactor;
      const pre = 2 + Math.random() * 4;
      const rest = 35 + Math.floor(Math.random() * 25);
      const sW = 4 + Math.floor(Math.random() * 4);
      const tPos = 20 + Math.floor(Math.random() * 8);
      const tW = 12 + Math.floor(Math.random() * 6);
      const total = rest + 6 + sW * 2 + 8 + tW + 15;
      const pts: number[] = [];
      for (let i = 0; i < total; i++) {
        if (i < rest) pts.push((Math.random() - 0.5) * noiseAmp);
        else if (i < rest + 3) pts.push(-((i - rest) / 3) * pre * scaleFactor);
        else if (i < rest + 3 + sW) pts.push(-pre * scaleFactor - ((i - rest - 3) / sW) * (spike - pre * scaleFactor));
        else if (i < rest + 3 + sW * 2) pts.push(-spike + ((i - rest - 3 - sW) / sW) * (spike + dip));
        else if (i < rest + 3 + sW * 2 + 8) pts.push(dip - ((i - rest - 3 - sW * 2) / 8) * dip);
        else {
          const tI = i - (rest + 3 + sW * 2 + 8);
          if (tI >= tPos && tI < tPos + tW) {
            const t = (tI - tPos) / tW;
            pts.push(-(t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5) * tH);
          } else {
            pts.push((Math.random() - 0.5) * noiseAmp);
          }
        }
      }
      return pts;
    }

    for (let i = 0; i < 30; i++) beats.current.push(makeBeat());

    function tick() {
      const w = c!.offsetWidth, h = c!.offsetHeight;
      c!.width = w * dpr; c!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      const barW = mini
        ? Math.min(Math.floor(w * 0.6), 140)
        : Math.min(Math.floor(w * 0.7), 600);
      const startX = Math.floor((w - barW) / 2);
      const cy = h / 2 + 2;
      if (!buffer.current || buffer.current.length !== barW) { buffer.current = new Float32Array(barW); pos.current = 0; }
      for (let step = 0; step < 2; step++) {
        const beat = beats.current[beatIdx.current % beats.current.length];
        const cp = Math.floor(cyclePos.current);
        buffer.current[pos.current] = cp < beat.length ? beat[cp] : (Math.random() - 0.5) * noiseAmp;
        cyclePos.current++;
        if (cyclePos.current >= beat.length) { cyclePos.current = 0; beatIdx.current++; }
        pos.current++; if (pos.current >= barW) pos.current = 0;
      }
      for (let i = 1; i <= eraseLen; i++) { buffer.current[(pos.current + i) % barW] = NaN; }

      function draw(from: number, to: number) {
        let pen = false;
        for (let i = from; i < to; i++) {
          const v = buffer.current![i]; if (isNaN(v)) { pen = false; continue; }
          if (!pen) { ctx!.moveTo(startX + i, cy + v); pen = true; } else ctx!.lineTo(startX + i, cy + v);
        }
      }

      ctx!.beginPath(); draw(0, barW);
      const g = ctx!.createLinearGradient(startX, 0, startX + barW, 0);
      g.addColorStop(0, "rgba(232,93,48,0)"); g.addColorStop(0.05, "rgba(232,93,48,0.8)");
      g.addColorStop(0.12, "rgba(232,93,48,1)"); g.addColorStop(0.88, "rgba(232,93,48,1)");
      g.addColorStop(0.95, "rgba(232,93,48,0.8)"); g.addColorStop(1, "rgba(232,93,48,0)");
      ctx!.strokeStyle = g; ctx!.lineWidth = lineW; ctx!.lineJoin = "bevel"; ctx!.stroke();

      // Glow pass — skip when mini
      if (!mini) {
        ctx!.save(); ctx!.globalAlpha = 0.08; ctx!.filter = "blur(5px)"; ctx!.lineWidth = 8; ctx!.strokeStyle = "#E85D30";
        ctx!.beginPath(); draw(0, barW); ctx!.stroke(); ctx!.restore();
      }

      const dx = startX + pos.current, dv = buffer.current[pos.current];
      if (!isNaN(dv)) {
        const dy = cy + dv;
        ctx!.beginPath(); ctx!.arc(dx, dy, dotRadius, 0, Math.PI * 2); ctx!.fillStyle = "#E85D30"; ctx!.fill();
        // Glow halo — skip when mini
        if (!mini) {
          const gl = ctx!.createRadialGradient(dx, dy, 0, dx, dy, 10);
          gl.addColorStop(0, "rgba(232,93,48,0.4)"); gl.addColorStop(1, "rgba(232,93,48,0)");
          ctx!.beginPath(); ctx!.arc(dx, dy, 10, 0, Math.PI * 2); ctx!.fillStyle = gl; ctx!.fill();
        }
      }
      raf.current = requestAnimationFrame(tick);
    }
    tick();
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [mini]);

  const canvasStyle: CSSProperties = {
    width: width ?? (mini ? 120 : '100%'),
    height: height ?? (mini ? 22 : 90),
    display: 'block',
    ...style,
  };

  return <canvas ref={cv} style={canvasStyle} />;
}
