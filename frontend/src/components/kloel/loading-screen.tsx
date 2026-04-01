'use client';

import { useEffect, useRef, useState } from "react";

/*
  KLOEL — Loading Screen
  "A máquina desperta."

  Não é um spinner. É um coração batendo.
  O ECG desenha ao vivo enquanto o sistema carrega.
  Quando termina, o heartbeat acelera e faz fade out.
*/

export default function KloelLoading() {
  const cv = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number>(0);
  const pos = useRef(0);
  const buffer = useRef<Float32Array | null>(null);
  const beatIdx = useRef(0);
  const cyclePos = useRef(0);
  const beats = useRef<number[][]>([]);
  const [opacity, setOpacity] = useState(0);

  // Fade in
  useEffect(() => {
    requestAnimationFrame(() => setOpacity(1));
  }, []);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    function makeBeat() {
      const spike = 22 + Math.random() * 20;
      const dip = 6 + Math.random() * 14;
      const tH = 3 + Math.random() * 6;
      const pre = 2 + Math.random() * 4;
      const rest = 35 + Math.floor(Math.random() * 25);
      const sW = 4 + Math.floor(Math.random() * 4);
      const tPos = 20 + Math.floor(Math.random() * 8);
      const tW = 12 + Math.floor(Math.random() * 6);
      const total = rest + 6 + sW * 2 + 8 + tW + 15;
      const pts: number[] = [];
      for (let i = 0; i < total; i++) {
        if (i < rest) pts.push((Math.random() - 0.5) * 0.3);
        else if (i < rest + 3) pts.push(-((i - rest) / 3) * pre);
        else if (i < rest + 3 + sW) pts.push(-pre - ((i - rest - 3) / sW) * (spike - pre));
        else if (i < rest + 3 + sW * 2) pts.push(-spike + ((i - rest - 3 - sW) / sW) * (spike + dip));
        else if (i < rest + 3 + sW * 2 + 8) pts.push(dip - ((i - rest - 3 - sW * 2) / 8) * dip);
        else {
          const tI = i - (rest + 3 + sW * 2 + 8);
          if (tI >= tPos && tI < tPos + tW) { const t = (tI - tPos) / tW; pts.push(-(t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5) * tH); }
          else pts.push((Math.random() - 0.5) * 0.3);
        }
      }
      return pts;
    }

    if (beats.current.length === 0) {
      for (let i = 0; i < 30; i++) beats.current.push(makeBeat());
    }

    function tick() {
      const w = c!.offsetWidth, h = c!.offsetHeight;
      c!.width = w * dpr; c!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      const barW = Math.min(Math.floor(w * 0.55), 420);
      const startX = Math.floor((w - barW) / 2);
      const cy = h / 2 + 20;

      if (!buffer.current || buffer.current.length !== barW) {
        buffer.current = new Float32Array(barW);
        pos.current = 0;
      }

      for (let step = 0; step < 2; step++) {
        const beat = beats.current[beatIdx.current % beats.current.length];
        const cp = Math.floor(cyclePos.current);
        buffer.current[pos.current] = cp < beat.length ? beat[cp] : (Math.random() - 0.5) * 0.3;
        cyclePos.current++;
        if (cyclePos.current >= beat.length) { cyclePos.current = 0; beatIdx.current++; }
        pos.current++;
        if (pos.current >= barW) pos.current = 0;
      }

      for (let i = 1; i <= 25; i++) buffer.current[(pos.current + i) % barW] = NaN;

      function draw() {
        let pen = false;
        for (let i = 0; i < barW; i++) {
          const v = buffer.current![i];
          if (isNaN(v)) { pen = false; continue; }
          if (!pen) { ctx!.moveTo(startX + i, cy + v); pen = true; }
          else ctx!.lineTo(startX + i, cy + v);
        }
      }

      // Main line
      ctx!.beginPath(); draw();
      const g = ctx!.createLinearGradient(startX, 0, startX + barW, 0);
      g.addColorStop(0, "rgba(232,93,48,0)");
      g.addColorStop(0.08, "rgba(232,93,48,0.6)");
      g.addColorStop(0.15, "rgba(232,93,48,1)");
      g.addColorStop(0.85, "rgba(232,93,48,1)");
      g.addColorStop(0.92, "rgba(232,93,48,0.6)");
      g.addColorStop(1, "rgba(232,93,48,0)");
      ctx!.strokeStyle = g;
      ctx!.lineWidth = 2;
      ctx!.lineJoin = "bevel";
      ctx!.stroke();

      // Glow
      ctx!.save();
      ctx!.globalAlpha = 0.08;
      ctx!.filter = "blur(6px)";
      ctx!.lineWidth = 10;
      ctx!.strokeStyle = "#E85D30";
      ctx!.beginPath(); draw();
      ctx!.stroke();
      ctx!.restore();

      // Cursor dot
      const dx = startX + pos.current;
      const dv = buffer.current[pos.current];
      if (!isNaN(dv)) {
        const dy = cy + dv;
        ctx!.beginPath();
        ctx!.arc(dx, dy, 3, 0, Math.PI * 2);
        ctx!.fillStyle = "#E85D30";
        ctx!.fill();

        const gl = ctx!.createRadialGradient(dx, dy, 0, dx, dy, 14);
        gl.addColorStop(0, "rgba(232,93,48,0.5)");
        gl.addColorStop(1, "rgba(232,93,48,0)");
        ctx!.beginPath();
        ctx!.arc(dx, dy, 14, 0, Math.PI * 2);
        ctx!.fillStyle = gl;
        ctx!.fill();
      }

      raf.current = requestAnimationFrame(tick);
    }

    tick();
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0A0A0C",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      opacity, transition: "opacity 0.6s ease",
      fontFamily: "'Sora', sans-serif",
    }}>
      <style>{`
        @keyframes fadeText { 0%,100% { opacity: 0.3; } 50% { opacity: 0.8; } }
      `}</style>

      {/* Logo */}
      <div style={{ marginBottom: 8, position: "relative", zIndex: 2 }}>
        <a href={process.env.NEXT_PUBLIC_SITE_URL || "https://kloel.com"} target="_blank" rel="noopener noreferrer" style={{ fontSize: 20, fontWeight: 700, color: "#E0DDD8", letterSpacing: "-0.03em", textDecoration: "none", cursor: "pointer" }}>Kloel</a>
      </div>

      {/* ECG Canvas — the heartbeat IS the loading indicator */}
      <canvas ref={cv} style={{ width: "100%", maxWidth: 600, height: 100, display: "block", position: "relative", zIndex: 1 }} />

      {/* Status text */}
      <div style={{ position: "relative", zIndex: 2, marginTop: 4 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: "#3A3A3F",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          animation: "fadeText 3s ease infinite",
        }}>
          Iniciando sistema
        </span>
      </div>
    </div>
  );
}

// Keep backward-compatible named export
export { KloelLoading as KloelLoadingScreen };
