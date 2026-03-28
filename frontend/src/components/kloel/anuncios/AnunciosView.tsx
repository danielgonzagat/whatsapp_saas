'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ── Fonts ──
const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── Colors ──
const G = '#10B981';
const R = '#EF4444';
const E = '#E85D30';

// ── Icons ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  meta:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/></svg>,
  gads:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M3.27 16.08l7.18-12.42a3.01 3.01 0 015.18 0l5.1 8.84a3 3 0 01-2.6 4.5H5.87a3 3 0 01-2.6-4.5z"/></svg>,
  tads:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.77 0 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z"/></svg>,
  zap:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  pause:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  play:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  dup:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  up:     (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  down:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>,
  search: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  link:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  shield: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

// ── Platforms ──
const PLATFORMS: Record<string, { icon: (s: number) => React.ReactElement; label: string; color: string; spend: number; revenue: number; roas: number; impressions: number; clicks: number; conversions: number; ctr: number; cpa: number; cpc: number }> = {
  meta: {
    icon: IC.meta, label: 'Meta Ads', color: '#1877F2',
    spend: 3230, revenue: 12840, roas: 3.97, impressions: 246000, clicks: 8520, conversions: 231, ctr: 3.46, cpa: 13.98, cpc: 0.38,
  },
  google: {
    icon: IC.gads, label: 'Google Ads', color: '#34A853',
    spend: 2520, revenue: 8960, roas: 3.56, impressions: 138000, clicks: 10200, conversions: 305, ctr: 7.39, cpa: 8.26, cpc: 0.25,
  },
  tiktok: {
    icon: IC.tads, label: 'TikTok Ads', color: '#ff0050',
    spend: 1850, revenue: 6500, roas: 3.51, impressions: 465000, clicks: 13100, conversions: 105, ctr: 2.82, cpa: 17.62, cpc: 0.14,
  },
};

// ── Campaigns ──
const CAMPAIGNS = [
  { name: 'Conversao - Lookalike BR', platform: 'meta', status: 'active', spend: 2340, impressions: 184000, clicks: 5420, conversions: 142, cpa: 16.48, trend: 'up' },
  { name: 'Retargeting - Cart Abandon', platform: 'meta', status: 'active', spend: 890, impressions: 62000, clicks: 3100, conversions: 89, cpa: 10.0, trend: 'up' },
  { name: 'Search - Brand Terms', platform: 'google', status: 'active', spend: 980, impressions: 42000, clicks: 6800, conversions: 210, cpa: 4.67, trend: 'up' },
  { name: 'Shopping - Catalog', platform: 'google', status: 'active', spend: 1540, impressions: 96000, clicks: 3400, conversions: 95, cpa: 16.21, trend: 'down' },
  { name: 'Spark Ads - UGC Top', platform: 'tiktok', status: 'active', spend: 1200, impressions: 320000, clicks: 8900, conversions: 67, cpa: 17.91, trend: 'up' },
  { name: 'In-Feed - Flash Sale', platform: 'tiktok', status: 'active', spend: 650, impressions: 145000, clicks: 4200, conversions: 38, cpa: 17.11, trend: 'down' },
  { name: 'Awareness - Summer Drop', platform: 'meta', status: 'paused', spend: 0, impressions: 0, clicks: 0, conversions: 0, cpa: 0, trend: 'down' },
  { name: 'Display - Remarketing', platform: 'google', status: 'paused', spend: 0, impressions: 0, clicks: 0, conversions: 0, cpa: 0, trend: 'down' },
  { name: 'Video Views - Tutorial', platform: 'tiktok', status: 'active', spend: 420, impressions: 89000, clicks: 2300, conversions: 18, cpa: 23.33, trend: 'down' },
  { name: 'DPA - Catalog Retarget', platform: 'meta', status: 'active', spend: 780, impressions: 54000, clicks: 2800, conversions: 62, cpa: 12.58, trend: 'up' },
];

// ── Rules ──
const RULES = [
  { id: 1, name: 'Pausar campanha se CPA > R$ 25', condition: 'CPA > 25', action: 'Pausar campanha', platform: 'all', active: true },
  { id: 2, name: 'Aumentar 10% budget se ROAS > 3x', condition: 'ROAS > 3', action: '+10% budget', platform: 'meta', active: true },
  { id: 3, name: 'Alertar se CTR < 1%', condition: 'CTR < 1%', action: 'Enviar alerta', platform: 'all', active: false },
  { id: 4, name: 'Duplicar ad set se CPA < R$ 10', condition: 'CPA < 10', action: 'Duplicar ad set', platform: 'meta', active: true },
  { id: 5, name: 'Reduzir budget se frequencia > 3', condition: 'Freq > 3', action: '-20% budget', platform: 'meta', active: false },
];

// ── IA Actions ──
const IA_ACTIONS = [
  { time: '14:32', action: 'Pausou "Awareness - Summer Drop"', reason: 'CPA ultrapassou R$ 25 por 3h consecutivas', platform: 'meta' },
  { time: '13:45', action: 'Aumentou budget +10% em "Conversao - Lookalike BR"', reason: 'ROAS consistente acima de 3.5x nas ultimas 6h', platform: 'meta' },
  { time: '12:18', action: 'Duplicou ad set vencedor "UGC Top"', reason: 'CPA R$ 8.40 - melhor performer da semana', platform: 'tiktok' },
  { time: '11:02', action: 'Alerta: CTR caindo em "Shopping - Catalog"', reason: 'CTR caiu de 3.8% para 2.1% em 24h', platform: 'google' },
  { time: '09:30', action: 'Redistribuiu R$ 200 de Display para Search', reason: 'Display ROAS 0.8x vs Search ROAS 4.2x', platform: 'google' },
  { time: '08:15', action: 'Pausou "Display - Remarketing"', reason: 'Frequencia atingiu 4.2 - fadiga de criativo', platform: 'google' },
];

// ── Helpers ──
const Fmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toString();
const FmtMoney = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// ── NeuralPulse canvas ──
function NP({ w, h }: { w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.strokeStyle = `hsla(${140 + i * 15}, 70%, 50%, ${0.15 + Math.sin(frame * 0.02 + i) * 0.1})`;
        ctx.lineWidth = 1.5;
        for (let x = 0; x < w; x += 4) {
          const y = h / 2 + Math.sin(x * 0.015 + frame * 0.03 + i * 1.2) * (15 + i * 5);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [w, h]);
  return <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', top: 0, left: 0, opacity: 0.4, pointerEvents: 'none' }} />;
}

// ── Ticker ──
function Ticker({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div style={{ overflow: 'hidden', width: '100%', background: 'rgba(16,185,129,0.06)', borderRadius: 8, padding: '8px 0' }}>
      <div style={{ display: 'flex', gap: 40, animation: 'anunciosTickerScroll 30s linear infinite', whiteSpace: 'nowrap' }}>
        {doubled.map((m, i) => (
          <span key={i} style={{ fontFamily: MONO, fontSize: 12, color: '#6ee7b7', opacity: 0.8 }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

// ── StatCard ──
function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontFamily: SORA, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 22, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════
const TABS = [
  { id: 'visao', label: 'War Room', icon: IC.zap },
  { id: 'meta', label: 'Meta Ads', icon: IC.meta },
  { id: 'google', label: 'Google Ads', icon: IC.gads },
  { id: 'tiktok', label: 'TikTok Ads', icon: IC.tads },
  { id: 'track', label: 'Rastreamento', icon: IC.link },
  { id: 'rules', label: 'Regras IA', icon: IC.shield },
];

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════
export default function AnunciosView({ defaultTab = 'visao' }: { defaultTab?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(defaultTab);
  const [profit, setProfit] = useState(20700);
  const [flash, setFlash] = useState(false);
  const [campStates, setCampStates] = useState<Record<string, string>>({});
  const [ruleStates, setRuleStates] = useState<Record<number, boolean>>(
    Object.fromEntries(RULES.map(r => [r.id, r.active]))
  );

  // Profit ticker
  useEffect(() => {
    const iv = setInterval(() => {
      const bump = Math.floor(Math.random() * 300) + 50;
      setProfit(p => p + bump);
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  const totalSpend = Object.values(PLATFORMS).reduce((a, p) => a + p.spend, 0);
  const totalRevenue = Object.values(PLATFORMS).reduce((a, p) => a + p.revenue, 0);

  const switchTab = (id: string) => {
    setTab(id);
    if (id === 'visao') router.push('/anuncios');
    else if (id === 'track') router.push('/anuncios/rastreamento');
    else if (id === 'rules') router.push('/anuncios/regras');
    else router.push(`/anuncios/${id}`);
  };

  // ── WarRoom ──
  const WarRoom = () => (
    <div style={{ animation: 'anunciosFadeIn .5s' }}>
      {/* Profit Hero */}
      <div style={{ position: 'relative', textAlign: 'center', padding: '40px 0 30px', marginBottom: 24, overflow: 'hidden', borderRadius: 16, background: 'rgba(16,185,129,0.04)' }}>
        <NP w={800} h={160} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: SORA, fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 2 }}>Lucro Liquido Tempo Real</div>
          <div style={{
            fontFamily: MONO, fontSize: 88, fontWeight: 700, color: G, marginTop: 8,
            textShadow: flash ? `0 0 40px rgba(16,185,129,0.8), 0 0 80px rgba(16,185,129,0.4)` : `0 0 20px rgba(16,185,129,0.3)`,
            transition: 'text-shadow .3s',
            animation: flash ? 'anunciosGlow .6s' : 'none',
          }}>
            R$ {profit.toLocaleString('pt-BR')}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: G, marginTop: 4 }}>+R$ {(profit - 20700).toLocaleString('pt-BR')} hoje</div>
        </div>
      </div>

      {/* Invest vs Return */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div style={{ flex: 1, background: 'rgba(239,68,68,0.06)', borderRadius: 12, padding: 20, textAlign: 'center', borderLeft: `3px solid ${R}` }}>
          <div style={{ fontFamily: SORA, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Investido</div>
          <div style={{ fontFamily: MONO, fontSize: 32, color: R, marginTop: 4 }}>{FmtMoney(totalSpend)}</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(16,185,129,0.06)', borderRadius: 12, padding: 20, textAlign: 'center', borderLeft: `3px solid ${G}` }}>
          <div style={{ fontFamily: SORA, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Retorno</div>
          <div style={{ fontFamily: MONO, fontSize: 32, color: G, marginTop: 4 }}>{FmtMoney(totalRevenue)}</div>
        </div>
      </div>

      {/* Platform Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginBottom: 20 }}>
        {Object.entries(PLATFORMS).map(([key, p]) => (
          <div key={key} onClick={() => switchTab(key)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, cursor: 'pointer', borderLeft: `3px solid ${p.color}`, transition: 'all .2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: p.color }}>{p.icon(20)}</span>
              <span style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb' }}>{p.label}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><span style={{ fontFamily: SORA, fontSize: 10, color: '#6b7280' }}>Gasto</span><div style={{ fontFamily: MONO, fontSize: 14, color: R }}>{FmtMoney(p.spend)}</div></div>
              <div><span style={{ fontFamily: SORA, fontSize: 10, color: '#6b7280' }}>Receita</span><div style={{ fontFamily: MONO, fontSize: 14, color: G }}>{FmtMoney(p.revenue)}</div></div>
              <div><span style={{ fontFamily: SORA, fontSize: 10, color: '#6b7280' }}>ROAS</span><div style={{ fontFamily: MONO, fontSize: 14, color: p.roas >= 3 ? G : E }}>{p.roas.toFixed(2)}x</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Campaign Fibers */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Campanhas Ativas</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontFamily: SORA, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Campanha</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>Plat.</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Gasto</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Conv.</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>CPA</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {CAMPAIGNS.filter(c => c.status === 'active').map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: SORA, fontSize: 13, color: '#d1d5db' }}>{c.name}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ color: PLATFORMS[c.platform]?.color }}>{PLATFORMS[c.platform]?.icon(14)}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>Ativo</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{FmtMoney(c.spend)}</td>
                  <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{c.conversions}</td>
                  <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: c.cpa <= 15 ? G : E, textAlign: 'right' }}>R$ {c.cpa.toFixed(2)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: c.trend === 'up' ? G : R }}>
                    {c.trend === 'up' ? IC.up(14) : IC.down(14)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* IA Decisions + Keywords */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'rgba(16,185,129,0.04)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {IC.zap(16)} Decisoes da IA Hoje
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {IA_ACTIONS.map((a, i) => (
              <div key={i} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, borderLeft: `2px solid ${PLATFORMS[a.platform]?.color || G}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: SORA, fontSize: 12, color: '#d1d5db' }}>{a.action}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280' }}>{a.time}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280' }}>{a.reason}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {IC.search(16)} Top Keywords
          </div>
          {[
            { kw: 'curso ia marketing', cpc: 2.45, conv: 42, pos: 1.8 },
            { kw: 'ebook funil vendas', cpc: 1.89, conv: 31, pos: 2.1 },
            { kw: 'mentoria digital', cpc: 3.12, conv: 18, pos: 1.5 },
            { kw: 'marketing digital curso', cpc: 2.78, conv: 56, pos: 2.4 },
            { kw: 'como vender online', cpc: 1.56, conv: 63, pos: 3.2 },
          ].map((k, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: '#d1d5db' }}>{k.kw}</span>
              <div style={{ display: 'flex', gap: 12, fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>
                <span>CPC R${k.cpc.toFixed(2)}</span>
                <span>{k.conv} conv</span>
                <span style={{ color: '#34A853' }}>#{k.pos.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ticker */}
      <div style={{ marginTop: 20 }}>
        <Ticker items={IA_ACTIONS.map(a => `${a.time} - ${a.action}`)} />
      </div>
    </div>
  );

  // ── PlatformTab ──
  const PlatformTab = ({ platformKey }: { platformKey: string }) => {
    const p = PLATFORMS[platformKey];
    if (!p) return null;
    const platformCampaigns = CAMPAIGNS.filter(c => c.platform === platformKey);
    const currentProfit = p.revenue - p.spend;

    return (
      <div style={{ animation: 'anunciosFadeIn .5s' }}>
        {/* Platform Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{ color: p.color }}>{p.icon(28)}</span>
          <span style={{ fontFamily: SORA, fontSize: 22, color: '#e5e7eb' }}>{p.label}</span>
        </div>

        {/* Profit */}
        <div style={{ textAlign: 'center', padding: '20px 0', marginBottom: 20, background: 'rgba(16,185,129,0.04)', borderRadius: 12 }}>
          <div style={{ fontFamily: SORA, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Lucro {p.label}</div>
          <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: currentProfit > 0 ? G : R, marginTop: 4 }}>
            {FmtMoney(currentProfit)}
          </div>
        </div>

        {/* 6 Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Gasto" value={FmtMoney(p.spend)} color={R} />
          <StatCard label="Receita" value={FmtMoney(p.revenue)} color={G} />
          <StatCard label="ROAS" value={p.roas.toFixed(2) + 'x'} color={p.roas >= 3 ? G : E} />
          <StatCard label="Impressoes" value={Fmt(p.impressions)} color={p.color} />
          <StatCard label="Cliques" value={Fmt(p.clicks)} color={p.color} sub={`CTR ${p.ctr.toFixed(2)}%`} />
          <StatCard label="Conversoes" value={p.conversions.toString()} color={G} sub={`CPA R$ ${p.cpa.toFixed(2)}`} />
        </div>

        {/* Campaign Table */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Campanhas</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontFamily: SORA, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Campanha</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Gasto</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Imp.</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Cliques</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Conv.</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>CPA</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Trend</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Acao</th>
                </tr>
              </thead>
              <tbody>
                {platformCampaigns.map((c, i) => {
                  const stateKey = `${platformKey}-${i}`;
                  const st = campStates[stateKey] || c.status;
                  return (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '10px 12px', fontFamily: SORA, fontSize: 13, color: '#d1d5db' }}>{c.name}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: st === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: st === 'active' ? '#22c55e' : '#ef4444' }}>
                          {st === 'active' ? 'Ativo' : 'Pausado'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{FmtMoney(c.spend)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{Fmt(c.impressions)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{Fmt(c.clicks)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{c.conversions}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: c.cpa <= 15 ? G : E, textAlign: 'right' }}>R$ {c.cpa.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: c.trend === 'up' ? G : R }}>
                        {c.trend === 'up' ? IC.up(14) : IC.down(14)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button onClick={() => setCampStates(prev => ({ ...prev, [stateKey]: st === 'active' ? 'paused' : 'active' }))} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#9ca3af', display: 'inline-flex', alignItems: 'center' }}>
                            {st === 'active' ? IC.pause(12) : IC.play(12)}
                          </button>
                          <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#9ca3af', display: 'inline-flex', alignItems: 'center' }}>
                            {IC.dup(12)}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── TrackingTab ──
  const TrackingTab = () => {
    const pixelCode = `<!-- Kloel Pixel -->
<script>
  !function(k,l,o,e,i){k.KloelPixel=i;k[i]=k[i]||function(){
  (k[i].q=k[i].q||[]).push(arguments)};var s=l.createElement('script');
  s.async=1;s.src=o;l.head.appendChild(s)}
  (window,document,'https://pixel.kloel.com/k.js','kp');
  kp('init','KP-XXXX-YYYY');
  kp('track','PageView');
</script>`;

    const events = [
      { name: 'PageView', fires: '24.3K', last: '2s ago', status: 'active' },
      { name: 'AddToCart', fires: '3.8K', last: '14s ago', status: 'active' },
      { name: 'InitiateCheckout', fires: '1.2K', last: '32s ago', status: 'active' },
      { name: 'Purchase', fires: '641', last: '1m ago', status: 'active' },
      { name: 'Lead', fires: '2.1K', last: '8s ago', status: 'active' },
      { name: 'ViewContent', fires: '18.7K', last: '1s ago', status: 'active' },
    ];

    const integrations = [
      { name: 'Meta Pixel', id: 'FB-123456789', status: 'active', events: 6, lastSync: '2s ago' },
      { name: 'Google Tag', id: 'GT-ABCDEF', status: 'active', events: 4, lastSync: '5s ago' },
      { name: 'TikTok Pixel', id: 'TT-987654', status: 'active', events: 3, lastSync: '12s ago' },
      { name: 'Google Analytics 4', id: 'GA4-XYZ123', status: 'active', events: 6, lastSync: '3s ago' },
    ];

    return (
      <div style={{ animation: 'anunciosFadeIn .5s' }}>
        <div style={{ fontFamily: SORA, fontSize: 22, color: '#e5e7eb', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          {IC.link(24)} Rastreamento
        </div>

        {/* Pixel Code */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Kloel Pixel - Codigo de Instalacao</div>
          <pre style={{ fontFamily: MONO, fontSize: 11, color: '#6ee7b7', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 16, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {pixelCode}
          </pre>
          <button style={{ marginTop: 12, fontFamily: SORA, fontSize: 12, padding: '8px 20px', borderRadius: 8, border: 'none', background: G, color: '#fff', cursor: 'pointer' }}>
            Copiar Codigo
          </button>
        </div>

        {/* Events */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Eventos Rastreados</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {events.map((e, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12, borderLeft: `2px solid ${G}` }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: '#e5e7eb', marginBottom: 4 }}>{e.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 18, color: G }}>{e.fires}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280', marginTop: 2 }}>{e.last}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Postback Integrations */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Integracoes Postback</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontFamily: SORA, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Plataforma</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>ID</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Eventos</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Ultimo Sync</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((int, i) => (
                  <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: SORA, fontSize: 13, color: '#d1d5db' }}>{int.name}</td>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>{int.id}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>Ativo</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>{int.events}</td>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: '#6b7280', textAlign: 'right' }}>{int.lastSync}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* WhatsApp X1 */}
        <div style={{ background: 'rgba(37,211,102,0.06)', borderRadius: 12, padding: 16, borderLeft: `3px solid #25D366` }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            WhatsApp X1 Tracking
          </div>
          <div style={{ fontFamily: SORA, fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
            Rastreie conversoes que acontecem via conversa no WhatsApp. A IA identifica automaticamente quando um lead converte durante o atendimento.
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatCard label="Conversas Rastreadas" value="1.583" color="#25D366" />
            <StatCard label="Conversoes X1" value="89" color="#25D366" />
            <StatCard label="Receita X1" value="R$ 34.200" color="#25D366" />
          </div>
        </div>
      </div>
    );
  };

  // ── RulesTab ──
  const RulesTab = () => (
    <div style={{ animation: 'anunciosFadeIn .5s' }}>
      <div style={{ fontFamily: SORA, fontSize: 22, color: '#e5e7eb', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        {IC.shield(24)} Regras IA
      </div>
      <div style={{ fontFamily: SORA, fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Fibras neurais que controlam seus anuncios automaticamente. A IA executa acoes baseadas em regras em tempo real.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {RULES.map((r) => {
          const active = ruleStates[r.id] ?? r.active;
          return (
            <div key={r.id} style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16,
              borderLeft: `3px solid ${active ? G : '#374151'}`,
              opacity: active ? 1 : 0.6,
              transition: 'all .3s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 4 }}>{r.name}</div>
                  <div style={{ display: 'flex', gap: 12, fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>
                    <span>Condicao: {r.condition}</span>
                    <span>Acao: {r.action}</span>
                    <span>Plataforma: {r.platform}</span>
                  </div>
                </div>
                {/* Toggle Switch */}
                <button
                  onClick={() => setRuleStates(prev => ({ ...prev, [r.id]: !active }))}
                  style={{
                    width: 48, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer',
                    background: active ? G : '#374151',
                    position: 'relative', transition: 'background .3s',
                    flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3,
                    left: active ? 25 : 3,
                    transition: 'left .3s',
                  }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Rule */}
      <button style={{
        marginTop: 16, width: '100%', padding: '14px 0', borderRadius: 12,
        border: '2px dashed rgba(16,185,129,0.3)', background: 'transparent',
        fontFamily: SORA, fontSize: 13, color: G, cursor: 'pointer',
      }}>
        + Criar Nova Regra
      </button>
    </div>
  );

  // ── Render Tab Content ──
  const renderTab = () => {
    switch (tab) {
      case 'visao': return <WarRoom />;
      case 'meta': return <PlatformTab platformKey="meta" />;
      case 'google': return <PlatformTab platformKey="google" />;
      case 'tiktok': return <PlatformTab platformKey="tiktok" />;
      case 'track': return <TrackingTab />;
      case 'rules': return <RulesTab />;
      default: return <WarRoom />;
    }
  };

  return (
    <div style={{ fontFamily: SORA, color: '#e5e7eb', minHeight: '100vh', padding: 24 }}>
      {/* CSS Keyframes */}
      <style>{`
        @keyframes anunciosFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes anunciosGlow { 0% { text-shadow: 0 0 20px rgba(16,185,129,0.3); } 50% { text-shadow: 0 0 60px rgba(16,185,129,0.9), 0 0 120px rgba(16,185,129,0.5); } 100% { text-shadow: 0 0 20px rgba(16,185,129,0.3); } }
        @keyframes anunciosTickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', paddingBottom: 8 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              fontFamily: SORA, fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
              background: tab === t.id ? 'rgba(16,185,129,0.15)' : 'transparent',
              color: tab === t.id ? '#6ee7b7' : '#6b7280',
              transition: 'all .2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {renderTab()}
    </div>
  );
}
