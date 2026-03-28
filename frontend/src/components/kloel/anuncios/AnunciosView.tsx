'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ── Fonts ──
const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";

// ── DNA Colors ──
const EMBER = '#E85D30';
const G = '#10B981';
const R = '#EF4444';

// ── Icons ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  meta:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  gads:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm5.2 17.6H6.8L12 6.4l5.2 11.2z"/></svg>,
  tads:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z"/></svg>,
  zap:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  pause:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  play:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  dup:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  up:     (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>,
  down:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-8h-5V4H9v8H4z"/></svg>,
  search: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  link:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  shield: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

// ── Mock Data ──
const PLATFORMS = {
  meta:   { name: 'Meta Ads',   color: '#1877F2', spend: 12480, revenue: 48720, roas: 3.9, conversions: 342, impressions: 892000, clicks: 18400, ctr: 2.06, cpc: 0.68 },
  google: { name: 'Google Ads', color: '#4285F4', spend: 8930,  revenue: 41650, roas: 4.66, conversions: 287, impressions: 1240000, clicks: 24100, ctr: 1.94, cpc: 0.37 },
  tiktok: { name: 'TikTok Ads', color: '#FF0050', spend: 5200,  revenue: 18200, roas: 3.5, conversions: 156, impressions: 2100000, clicks: 42000, ctr: 2.0, cpc: 0.12 },
} as const;

const CAMPAIGNS = [
  { id: 'c1', platform: 'meta' as const,   name: 'Remarketing - Carrinho Abandonado', status: 'active', spend: 3200, revenue: 18400, roas: 5.75, conv: 89, ctr: 3.4, cpc: 0.52, trend: 'up' as const },
  { id: 'c2', platform: 'google' as const, name: 'Search - Marca Principal',          status: 'active', spend: 2100, revenue: 14200, roas: 6.76, conv: 102, ctr: 4.1, cpc: 0.31, trend: 'up' as const },
  { id: 'c3', platform: 'meta' as const,   name: 'Lookalike - Compradores 180d',      status: 'active', spend: 4800, revenue: 16800, roas: 3.5,  conv: 78, ctr: 2.1, cpc: 0.74, trend: 'up' as const },
  { id: 'c4', platform: 'tiktok' as const, name: 'Spark Ads - UGC Review',            status: 'active', spend: 2600, revenue: 10400, roas: 4.0,  conv: 84, ctr: 2.8, cpc: 0.10, trend: 'up' as const },
  { id: 'c5', platform: 'google' as const, name: 'PMAX - Catalogo Completo',          status: 'active', spend: 3400, revenue: 15200, roas: 4.47, conv: 95, ctr: 1.6, cpc: 0.42, trend: 'down' as const },
  { id: 'c6', platform: 'meta' as const,   name: 'Broad - Interesse Fitness',         status: 'paused', spend: 1800, revenue: 2700,  roas: 1.5,  conv: 22, ctr: 1.2, cpc: 1.10, trend: 'down' as const },
  { id: 'c7', platform: 'tiktok' as const, name: 'TopView - Lancamento Verao',        status: 'active', spend: 2600, revenue: 7800,  roas: 3.0,  conv: 72, ctr: 1.9, cpc: 0.14, trend: 'up' as const },
  { id: 'c8', platform: 'google' as const, name: 'Search - Concorrentes',             status: 'active', spend: 3430, revenue: 12250, roas: 3.57, conv: 90, ctr: 2.3, cpc: 0.38, trend: 'down' as const },
  { id: 'c9', platform: 'meta' as const,   name: 'DPA - Catalogo Dinamico',           status: 'active', spend: 2680, revenue: 10820, roas: 4.04, conv: 53, ctr: 2.6, cpc: 0.62, trend: 'up' as const },
  { id: 'c10', platform: 'tiktok' as const, name: 'In-Feed - Oferta Flash',           status: 'paused', spend: 1200, revenue: 1100,  roas: 0.92, conv: 12, ctr: 0.8, cpc: 0.22, trend: 'down' as const },
];

const RULES = [
  { id: 'r1', condition: 'ROAS < 1.0 por 48h', action: 'Pausar campanha', active: true, fires: 14 },
  { id: 'r2', condition: 'ROAS > 5.0 por 24h', action: 'Aumentar orcamento 20%', active: true, fires: 8 },
  { id: 'r3', condition: 'CPA > R$80', action: 'Alertar WhatsApp', active: true, fires: 23 },
  { id: 'r4', condition: 'CTR < 0.5%', action: 'Pausar anuncio', active: false, fires: 5 },
  { id: 'r5', condition: 'Conv > 50 e ROAS > 3', action: 'Duplicar campanha', active: true, fires: 3 },
];

const IA_ACTIONS = [
  { time: '2min', text: 'Pausou "In-Feed Oferta Flash" — ROAS 0.92 por 48h', type: 'alert' as const },
  { time: '14min', text: 'Escalou orcamento "Remarketing Carrinho" +20% — ROAS 5.75', type: 'scale' as const },
  { time: '38min', text: 'Duplicou "Spark Ads UGC" para audiencia similar', type: 'dup' as const },
  { time: '1h', text: 'Criou alerta WhatsApp — CPA "Broad Fitness" > R$80', type: 'alert' as const },
  { time: '2h', text: 'Novo publico lookalike gerado a partir de compradores 90d', type: 'new' as const },
  { time: '3h', text: 'Redistribuiu R$400 de Google Search para Meta Remarketing', type: 'scale' as const },
];

// ── Helpers ──
function Fmt(v: number): string {
  return v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toString();
}
const FmtMoney = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const roasColor = (r: number) => r > 4 ? G : r > 2 ? '#E0DDD8' : r > 1.5 ? '#F59E0B' : R;
const fiberColor = (r: number) => r > 10 ? G : r > 3 ? '#E0DDD8' : r > 1.5 ? '#F59E0B' : R;
const actionDotColor = (t: string) => {
  const colors: Record<string, string> = { alert: R, scale: G, dup: '#1877F2', new: '#F59E0B' };
  return colors[t] || '#F59E0B';
};

// ── NeuralPulse canvas ──
function NP({ color, intensity = 1, width = 120, height = 20 }: { color: string; intensity?: number; width?: number; height?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.12 + Math.sin(frame * 0.02 + i) * 0.08;
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 2) {
          const spike = Math.random() > (0.98 - intensity * 0.01) ? (Math.random() - 0.5) * height * 0.6 * intensity : 0;
          const y = height / 2 + Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (height * 0.2 + i * 2) * intensity + spike;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [width, height, color, intensity]);
  return <canvas ref={cv} width={width} height={height} style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' as const }} />;
}

// ── Ticker (animated counter) ──
function Ticker({ value, prefix = '' }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let current = display;
    const diff = value - current;
    if (Math.abs(diff) < 1) { setDisplay(value); return; }
    const steps = 30;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const ease = 1 - Math.pow(1 - step / steps, 3);
      const next = current + diff * ease;
      setDisplay(next);
      if (step >= steps) { setDisplay(value); clearInterval(iv); }
    }, 33);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span>{prefix}{display >= 1000 ? FmtMoney(Math.round(display)) : display.toFixed(2)}</span>;
}

// ── Routes ──
const routes: Record<string, string> = {
  visao: '/anuncios',
  meta: '/anuncios/meta',
  google: '/anuncios/google',
  tiktok: '/anuncios/tiktok',
  track: '/anuncios/rastreamento',
  rules: '/anuncios/regras',
};

// ── Tab config ──
const TABS = [
  { id: 'visao',  label: 'War Room',      iconKey: 'zap',    activeColor: EMBER },
  { id: 'meta',   label: 'Meta Ads',      iconKey: 'meta',   activeColor: '#1877F2' },
  { id: 'google', label: 'Google Ads',    iconKey: 'gads',   activeColor: '#4285F4' },
  { id: 'tiktok', label: 'TikTok Ads',    iconKey: 'tads',   activeColor: '#FF0050' },
  { id: 'track',  label: 'Rastreamento',  iconKey: 'link',   activeColor: EMBER },
  { id: 'rules',  label: 'Regras IA',     iconKey: 'shield', activeColor: EMBER },
];

// ── WarRoom ──
function WarRoom({ campStates, toggleCamp }: { campStates: Record<string, boolean>; toggleCamp: (id: string) => void }) {
  const totalSpend = PLATFORMS.meta.spend + PLATFORMS.google.spend + PLATFORMS.tiktok.spend;
  const totalRev = PLATFORMS.meta.revenue + PLATFORMS.google.revenue + PLATFORMS.tiktok.revenue;
  const profit = totalRev - totalSpend;
  const totalConv = PLATFORMS.meta.conversions + PLATFORMS.google.conversions + PLATFORMS.tiktok.conversions;
  const totalRoas = totalRev / totalSpend;
  const activeCamps = CAMPAIGNS.filter(c => campStates[c.id] !== false && c.status === 'active').length;
  const sorted = [...CAMPAIGNS].sort((a, b) => b.roas - a.roas);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, animation: 'fadeIn .3s ease' }}>
      {/* LUCRO */}
      <div style={{ textAlign: 'center' as const, padding: '24px 0 8px' }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 2, marginBottom: 8 }}>LUCRO LIQUIDO</div>
        <div style={{ fontSize: 88, fontWeight: 800, fontFamily: MONO, color: G, textShadow: `0 0 40px ${G}44, 0 0 80px ${G}22`, lineHeight: 1 }}>
          <Ticker value={profit} prefix="" />
        </div>
      </div>

      {/* Investido vs Retorno */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center' }}>
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20, textAlign: 'center' as const }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 6 }}>INVESTIDO</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: MONO, color: R }}><Ticker value={totalSpend} /></div>
        </div>
        <div style={{ fontSize: 28, color: '#3A3A3F' }}>&rarr;</div>
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20, textAlign: 'center' as const }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 6 }}>RETORNO</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: MONO, color: G }}><Ticker value={totalRev} /></div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'ROAS', value: totalRoas.toFixed(2) + 'x', color: roasColor(totalRoas) },
          { label: 'CONVERSOES', value: Fmt(totalConv), color: EMBER },
          { label: 'CAMPANHAS', value: String(activeCamps), color: '#E0DDD8' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: MONO, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Platform cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {(Object.keys(PLATFORMS) as Array<keyof typeof PLATFORMS>).map(key => {
          const p = PLATFORMS[key];
          const pIcon = key === 'meta' ? IC.meta : key === 'google' ? IC.gads : IC.tads;
          return (
            <div key={key} style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, overflow: 'hidden' as const, position: 'relative' as const }}>
              <div style={{ height: 2, background: p.color }} />
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ color: p.color }}>{pIcon(14)}</span>
                  <span style={{ fontSize: 13, fontFamily: SORA, color: '#E0DDD8', fontWeight: 600 }}>{p.name}</span>
                  <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: G, animation: 'pulse 2s infinite', flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: '#6E6E73' }}>SPEND</div>
                    <div style={{ fontSize: 16, fontFamily: MONO, color: R, fontWeight: 600 }}>{FmtMoney(p.spend)}</div>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontSize: 10, fontFamily: MONO, color: '#6E6E73' }}>REV</div>
                    <div style={{ fontSize: 16, fontFamily: MONO, color: G, fontWeight: 600 }}>{FmtMoney(p.revenue)}</div>
                  </div>
                </div>
                <NP color={p.color} intensity={p.roas / 5} width={200} height={28} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div style={{ fontSize: 18, fontFamily: MONO, fontWeight: 700, color: roasColor(p.roas) }}>{p.roas.toFixed(2)}x</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, animation: 'pulse 2s infinite' }} />
                    <span style={{ fontSize: 10, fontFamily: MONO, color: '#6E6E73' }}>LIVE</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Campaign nerve fibers */}
      <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 12 }}>CAMPANHAS — FIBRAS NEURAIS</div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {sorted.map(c => {
            const paused = campStates[c.id] === false;
            const pIcon = c.platform === 'meta' ? IC.meta : c.platform === 'google' ? IC.gads : IC.tads;
            const pColor = PLATFORMS[c.platform].color;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#19191C', borderRadius: 6, opacity: paused ? 0.4 : 1, transition: 'opacity 150ms ease', borderLeft: `3px solid ${fiberColor(c.roas)}` }}>
                <span style={{ color: pColor, flexShrink: 0 }}>{pIcon(14)}</span>
                <span style={{ fontSize: 12, fontFamily: SORA, color: '#E0DDD8', flex: 1, overflow: 'hidden' as const, textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.name}</span>
                <NP color={fiberColor(c.roas)} intensity={c.roas / 4} width={80} height={20} />
                <span style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: roasColor(c.roas), minWidth: 52, textAlign: 'right' as const }}>{c.roas.toFixed(2)}x</span>
                <span style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', minWidth: 40, textAlign: 'right' as const }}>{c.conv} conv</span>
                <button onClick={() => toggleCamp(c.id)} style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', padding: 4, display: 'flex', transition: 'color 150ms ease' }}>{paused ? IC.play(12) : IC.pause(12)}</button>
                <button style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', padding: 4, display: 'flex', transition: 'color 150ms ease' }}>{IC.dup(12)}</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* IA decisions + invest bars + keywords */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* IA decisions */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 12 }}>DECISOES IA — ULTIMAS 3H</div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {IA_ACTIONS.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, opacity: 1 - i * 0.12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: actionDotColor(a.type), marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontFamily: SORA, color: '#E0DDD8', lineHeight: 1.4 }}>{a.text}</div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: '#3A3A3F', marginTop: 2 }}>{a.time} atras</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invest vs Return bars + top keywords */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 12 }}>INVESTIMENTO vs RETORNO</div>
            {(Object.keys(PLATFORMS) as Array<keyof typeof PLATFORMS>).map(key => {
              const p = PLATFORMS[key];
              const maxVal = Math.max(...Object.values(PLATFORMS).map(pl => pl.revenue));
              return (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: '#6E6E73', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ height: 6, borderRadius: 3, background: R, width: `${(p.spend / maxVal) * 100}%`, transition: 'width 150ms ease' }} />
                    <div style={{ height: 6, borderRadius: 3, background: G, width: `${(p.revenue / maxVal) * 100}%`, transition: 'width 150ms ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 12 }}>TOP KEYWORDS</div>
            {[
              { kw: 'suplemento whey', conv: 124, cpc: 0.42 },
              { kw: 'creatina importada', conv: 89, cpc: 0.58 },
              { kw: 'kit emagrecimento', conv: 67, cpc: 0.71 },
            ].map((k, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid #19191C' : 'none' }}>
                <span style={{ fontSize: 12, fontFamily: SORA, color: '#E0DDD8' }}>{k.kw}</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: EMBER }}>{k.conv} conv</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: '#6E6E73' }}>CPC {k.cpc.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PlatformTab ──
function PlatformTab({ platformKey }: { platformKey: string }) {
  const p = PLATFORMS[platformKey as keyof typeof PLATFORMS];
  if (!p) return null;
  const profit = p.revenue - p.spend;
  const profitColor = profit >= 0 ? G : R;
  const camps = CAMPAIGNS.filter(c => c.platform === platformKey);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, animation: 'fadeIn .3s ease' }}>
      {/* Profit */}
      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 2, marginBottom: 8 }}>LUCRO {p.name.toUpperCase()}</div>
        <div style={{ fontSize: 64, fontWeight: 800, fontFamily: MONO, color: profitColor, textShadow: `0 0 30px ${profitColor}44`, lineHeight: 1 }}>
          {FmtMoney(profit)}
        </div>
      </div>

      {/* 6 metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {[
          { label: 'GASTO', value: FmtMoney(p.spend), color: R },
          { label: 'RETORNO', value: FmtMoney(p.revenue), color: G },
          { label: 'ROAS', value: p.roas.toFixed(2) + 'x', color: roasColor(p.roas) },
          { label: 'CONV', value: String(p.conversions), color: EMBER },
          { label: 'CTR', value: p.ctr.toFixed(2) + '%', color: '#E0DDD8' },
          { label: 'CPC', value: 'R$ ' + p.cpc.toFixed(2), color: '#6E6E73' },
        ].map(m => (
          <div key={m.label} style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 14, textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Campaign table */}
      <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, overflow: 'hidden' as const }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1fr 1fr 0.8fr 0.6fr 0.8fr 0.8fr', padding: '10px 16px', borderBottom: '1px solid #222226' }}>
          {['Campanha', 'Status', 'Gasto', 'Retorno', 'ROAS', 'Conv', 'CPC', 'Acoes'].map(h => (
            <div key={h} style={{ fontSize: 10, fontFamily: MONO, color: '#3A3A3F', letterSpacing: 1, textTransform: 'uppercase' as const }}>{h}</div>
          ))}
        </div>
        {camps.map(c => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1fr 1fr 0.8fr 0.6fr 0.8fr 0.8fr', padding: '10px 16px', borderBottom: '1px solid #19191C', alignItems: 'center', transition: 'background 150ms ease' }}>
            <div style={{ fontSize: 12, fontFamily: SORA, color: '#E0DDD8', overflow: 'hidden' as const, textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.name}</div>
            <div>
              <span style={{ fontSize: 10, fontFamily: MONO, padding: '2px 6px', borderRadius: 4, background: c.status === 'active' ? `${G}18` : '#3A3A3F18', color: c.status === 'active' ? G : '#6E6E73' }}>
                {c.status === 'active' ? 'Ativo' : 'Pausado'}
              </span>
            </div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: R }}>{FmtMoney(c.spend)}</div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: G }}>{FmtMoney(c.revenue)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 600, color: roasColor(c.roas) }}>{c.roas.toFixed(2)}x</span>
              <span style={{ color: c.trend === 'up' ? G : R }}>{c.trend === 'up' ? IC.up(10) : IC.down(10)}</span>
            </div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: '#E0DDD8' }}>{c.conv}</div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: '#6E6E73' }}>R$ {c.cpc.toFixed(2)}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', padding: 2, display: 'flex' }}>{c.status === 'active' ? IC.pause(12) : IC.play(12)}</button>
              <button style={{ background: 'none', border: 'none', color: '#6E6E73', cursor: 'pointer', padding: 2, display: 'flex' }}>{IC.dup(12)}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TrackingTab ──
function TrackingTab() {
  const trackedSales = 785;
  const pixelFires = 24892;
  const postbacks = 1847;
  const utms = 342;
  const attribution = 94.2;

  const events = [
    { name: 'PageView', fires: 24892 },
    { name: 'AddToCart', fires: 4821 },
    { name: 'InitiateCheckout', fires: 1893 },
    { name: 'Purchase', fires: 785 },
  ];

  const integrations = [
    { name: 'Kiwify', connected: true },
    { name: 'Hotmart', connected: true },
    { name: 'Braip', connected: false },
    { name: 'Eduzz', connected: false },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, animation: 'fadeIn .3s ease' }}>
      {/* Vendas rastreadas */}
      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 2, marginBottom: 8 }}>VENDAS RASTREADAS</div>
        <div style={{ fontSize: 64, fontWeight: 800, fontFamily: MONO, color: EMBER, textShadow: `0 0 30px ${EMBER}44`, lineHeight: 1 }}>{trackedSales}</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'PIXEL FIRES', value: Fmt(pixelFires), color: EMBER },
          { label: 'POSTBACKS', value: Fmt(postbacks), color: G },
          { label: 'UTMs', value: String(utms), color: '#E0DDD8' },
          { label: 'ATRIBUICAO', value: attribution + '%', color: G },
        ].map(s => (
          <div key={s.label} style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 14, textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Pixel code */}
      <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 12 }}>PIXEL KLOEL — COPIE E COLE NO SEU SITE</div>
        <div style={{ background: '#0A0A0C', borderRadius: 6, padding: 14, fontFamily: MONO, fontSize: 9, color: '#6E6E73', lineHeight: 1.8, overflowX: 'auto' as const, whiteSpace: 'pre' as const, border: '1px solid #19191C' }}>
{`<script>
  !function(k,l,o,e,i){k.KloelPixel=i;k[i]=k[i]||function(){
  (k[i].q=k[i].q||[]).push(arguments)};k[i].l=1*new Date();
  var s=l.createElement('script'),f=l.getElementsByTagName('script')[0];
  s.async=1;s.src='https://px.kloel.com/kl.js';
  f.parentNode.insertBefore(s,f)}(window,document,0,0,'kl');
  kl('init','KL-XXXXXXXX');
  kl('track','PageView');
</script>`}
        </div>
      </div>

      {/* Events */}
      <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 12 }}>EVENTOS RASTREADOS</div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {events.map(e => (
            <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#19191C', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: G }} />
                <span style={{ fontSize: 12, fontFamily: MONO, color: '#E0DDD8' }}>{e.name}</span>
              </div>
              <span style={{ fontSize: 14, fontFamily: MONO, color: EMBER, fontWeight: 600 }}>{Fmt(e.fires)} fires</span>
            </div>
          ))}
        </div>
      </div>

      {/* Postback integrations */}
      <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 12 }}>POSTBACK INTEGRACOES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {integrations.map(ig => (
            <div key={ig.name} style={{ background: '#19191C', borderRadius: 6, padding: 14, textAlign: 'center' as const, border: `1px solid ${ig.connected ? G + '33' : '#222226'}` }}>
              <div style={{ fontSize: 14, fontFamily: SORA, color: ig.connected ? '#E0DDD8' : '#3A3A3F', fontWeight: 600, marginBottom: 6 }}>{ig.name}</div>
              <div style={{ fontSize: 10, fontFamily: MONO, color: ig.connected ? G : '#3A3A3F' }}>
                {ig.connected ? 'CONNECTED' : 'DISCONNECTED'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp X1 */}
      <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#25D366' }}>{IC.zap(16)}</span>
          <div>
            <div style={{ fontSize: 13, fontFamily: SORA, color: '#E0DDD8', fontWeight: 600 }}>WhatsApp X1 Tracking</div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73' }}>Atribuicao de vendas via conversa</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 11, fontFamily: MONO, color: G }}>ATIVO</span>
        </div>
      </div>
    </div>
  );
}

// ── RulesTab ──
function RulesTab() {
  const [rules, setRules] = useState(RULES);
  const activeCount = rules.filter(r => r.active).length;
  const totalFires = rules.reduce((s, r) => s + r.fires, 0);

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, animation: 'fadeIn .3s ease' }}>
      {/* Regras ativas */}
      <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 2, marginBottom: 8 }}>REGRAS ATIVAS</div>
        <div style={{ fontSize: 64, fontWeight: 800, fontFamily: MONO, color: EMBER, textShadow: `0 0 30px ${EMBER}44`, lineHeight: 1 }}>{activeCount}</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'EXECUCOES HOJE', value: String(totalFires), color: EMBER },
          { label: 'DINHEIRO SALVO', value: 'R$ 2.840', color: G },
          { label: 'TEMPO SALVO', value: '4.2h', color: '#E0DDD8' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 14, textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Rules as nerve fibers */}
      <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#6E6E73', letterSpacing: 1, marginBottom: 12 }}>REGRAS — FIBRAS NEURAIS</div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {rules.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#19191C', borderRadius: 6, borderLeft: `3px solid ${r.active ? EMBER : '#3A3A3F'}`, opacity: r.active ? 1 : 0.5, transition: 'opacity 150ms ease' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontFamily: MONO, color: '#E0DDD8', marginBottom: 2 }}>IF {r.condition}</div>
                <div style={{ fontSize: 11, fontFamily: MONO, color: EMBER }}>&rarr; {r.action}</div>
              </div>
              <NP color={r.active ? EMBER : '#3A3A3F'} intensity={r.active ? 1.2 : 0.3} width={80} height={20} />
              <span style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: '#E0DDD8', minWidth: 36, textAlign: 'right' as const }}>{r.fires}</span>
              <button onClick={() => toggleRule(r.id)} style={{ width: 36, height: 20, borderRadius: 10, border: 'none', background: r.active ? EMBER : '#3A3A3F', cursor: 'pointer', position: 'relative' as const, transition: 'background 150ms ease', flexShrink: 0 }}>
                <span style={{ position: 'absolute' as const, top: 3, left: r.active ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 150ms ease' } as React.CSSProperties} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Criar nova regra */}
      <button style={{ background: 'transparent', border: '1px dashed #3A3A3F', borderRadius: 6, padding: 16, color: '#6E6E73', fontSize: 13, fontFamily: SORA, cursor: 'pointer', transition: 'border-color 150ms ease, color 150ms ease', textAlign: 'center' as const }}>
        + Criar nova regra
      </button>
    </div>
  );
}

// ── Main component ──
export default function AnunciosView({ defaultTab = 'visao' }: { defaultTab?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(defaultTab);
  const [campStates, setCampStates] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    CAMPAIGNS.forEach(c => { initial[c.id] = c.status === 'active'; });
    return initial;
  });

  function toggle(id: string) {
    setCampStates(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div style={{ fontFamily: SORA, color: '#E0DDD8', minHeight: '100vh' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #222226', padding: '0 16px', overflowX: 'auto' as const }}>
        {TABS.map(t => {
          const active = tab === t.id;
          const icon = IC[t.iconKey];
          return (
            <button key={t.id} onClick={() => { setTab(t.id); router.push(routes[t.id] || '/anuncios'); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', background: 'none', color: active ? t.activeColor : '#6E6E73', borderBottom: active ? `2px solid ${t.activeColor}` : '2px solid transparent', cursor: 'pointer', fontSize: 13, fontFamily: SORA, whiteSpace: 'nowrap' as const, transition: 'color 150ms ease' }}>
              {icon(14)}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding: 24 }}>
        {tab === 'visao' && <WarRoom campStates={campStates} toggleCamp={toggle} />}
        {tab === 'meta' && <PlatformTab platformKey="meta" />}
        {tab === 'google' && <PlatformTab platformKey="google" />}
        {tab === 'tiktok' && <PlatformTab platformKey="tiktok" />}
        {tab === 'track' && <TrackingTab />}
        {tab === 'rules' && <RulesTab />}
      </div>
    </div>
  );
}
