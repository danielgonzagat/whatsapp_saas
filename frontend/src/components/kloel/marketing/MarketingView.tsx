'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMarketingStats, useMarketingChannels, useMarketingLiveFeed, useAIBrain } from '@/hooks/useMarketing';

// ── Fonts ──
const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── Icons (SVG arrow functions) ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  wa:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.01a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374A9.86 9.86 0 012.16 12.01C2.16 6.579 6.58 2.16 12.06 2.16a9.84 9.84 0 016.982 2.892 9.84 9.84 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zM20.52 3.449A11.8 11.8 0 0012.05.002C5.463.002.104 5.36.1 11.95a11.82 11.82 0 001.588 5.945L0 24l6.304-1.654a11.88 11.88 0 005.683 1.448h.005c6.585 0 11.946-5.36 11.95-11.95a11.84 11.84 0 00-3.498-8.395z"/></svg>,
  ig:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
  tt:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z"/></svg>,
  fb:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  em:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>,
  zap:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  globe: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  site:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="10" cy="6" r="1" fill="currentColor"/></svg>,
  send:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>,
  key:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  check: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg>,
  pause: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  play:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  box:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  meta:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/></svg>,
  gads:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M3.27 16.08l7.18-12.42a3.01 3.01 0 015.18 0l5.1 8.84a3 3 0 01-2.6 4.5H5.87a3 3 0 01-2.6-4.5z"/></svg>,
  tads:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.77 0 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.58-1.43V6.69h3.58z"/></svg>,
  search:(s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

// ── Channels ──
const CH: Record<string, { icon: (s: number) => React.ReactElement; label: string; color: string; msgs: number; leads: number; sales: number; revenue: number; convos: number; account: string }> = {
  whatsapp:  { icon: IC.wa, label: 'WhatsApp',  color: '#25D366', msgs: 12847, leads: 342, sales: 89, revenue: 34200, convos: 1583, account: '+55 11 91234-5678' },
  instagram: { icon: IC.ig, label: 'Instagram', color: '#E1306C', msgs: 8432,  leads: 215, sales: 54, revenue: 21800, convos: 967,  account: '@kloel.store' },
  tiktok:    { icon: IC.tt, label: 'TikTok',    color: '#ff0050', msgs: 5621,  leads: 189, sales: 41, revenue: 16500, convos: 423,  account: '@kloel.store' },
  facebook:  { icon: IC.fb, label: 'Facebook',  color: '#1877F2', msgs: 3219,  leads: 127, sales: 33, revenue: 12100, convos: 712,  account: 'Kloel Store' },
  email:     { icon: IC.em, label: 'Email',     color: '#F59E0B', msgs: 24300, leads: 410, sales: 67, revenue: 15798, convos: 0,    account: 'contato@kloel.com' },
};

// ── Ads ──
const ADS: Record<string, { icon: (s: number) => React.ReactElement; label: string; color: string; campaigns: { name: string; status: string; spend: number; impressions: number; clicks: number; conversions: number; cpa: number }[] }> = {
  'meta-ads': {
    icon: IC.meta, label: 'Meta Ads', color: '#1877F2',
    campaigns: [
      { name: 'Conversao \u2013 Lookalike BR', status: 'active', spend: 2340, impressions: 184000, clicks: 5420, conversions: 142, cpa: 16.48 },
      { name: 'Retargeting \u2013 Cart Abandon', status: 'active', spend: 890, impressions: 62000, clicks: 3100, conversions: 89, cpa: 10.0 },
      { name: 'Awareness \u2013 Summer Drop', status: 'paused', spend: 0, impressions: 0, clicks: 0, conversions: 0, cpa: 0 },
    ],
  },
  'tiktok-ads': {
    icon: IC.tads, label: 'TikTok Ads', color: '#ff0050',
    campaigns: [
      { name: 'Spark Ads \u2013 UGC Top', status: 'active', spend: 1200, impressions: 320000, clicks: 8900, conversions: 67, cpa: 17.91 },
      { name: 'In-Feed \u2013 Flash Sale', status: 'active', spend: 650, impressions: 145000, clicks: 4200, conversions: 38, cpa: 17.11 },
    ],
  },
  'google-ads': {
    icon: IC.gads, label: 'Google Ads', color: '#34A853',
    campaigns: [
      { name: 'Search \u2013 Brand Terms', status: 'active', spend: 980, impressions: 42000, clicks: 6800, conversions: 210, cpa: 4.67 },
      { name: 'Shopping \u2013 Catalog', status: 'active', spend: 1540, impressions: 96000, clicks: 3400, conversions: 95, cpa: 16.21 },
      { name: 'Display \u2013 Remarketing', status: 'paused', spend: 0, impressions: 0, clicks: 0, conversions: 0, cpa: 0 },
    ],
  },
};

// ── Products ──
const PRODUCTS = [
  { name: 'Curso IA', price: 497, sold: 312, img: '🤖' },
  { name: 'eBook Funil', price: 47, sold: 892, img: '📘' },
  { name: 'Mentoria Premium', price: 2997, sold: 34, img: '🎯' },
];

// ── Stream Messages ──
const STREAM_MSGS: Record<string, string[]> & { all: string[] } = {
  whatsapp: [
    '📱 Nova conversa iniciada \u2014 Joao S.',
    '✅ Pedido #4821 confirmado via WhatsApp',
    '💬 "Tem PP?" \u2014 Maria L.',
    '🔔 Lembrete de carrinho enviado \u2014 14 clientes',
    '📦 Rastreio compartilhado \u2014 Pedido #4819',
  ],
  instagram: [
    '❤️ Story respondido por @lucas.fit',
    '🛒 Clicou no link da bio \u2014 @carol_moda',
    '💬 DM: "Quanto custa o tenis?" \u2014 @pedrooo',
    '📸 Novo reels alcancou 12.4K views',
  ],
  tiktok: [
    '🎵 Video "Unboxing Kloel" atingiu 45K views',
    '💬 Comentario: "Link?" \u2014 @fashionista_br',
    '🔥 Novo seguidor via Spark Ad \u2014 +234 hoje',
  ],
  facebook: [
    '👍 Post "Novidades de Verao" \u2014 342 reacoes',
    '💬 Messenger: "Voces entregam no RJ?" \u2014 Ana C.',
    '📊 Anuncio atingiu 18K impressoes',
  ],
  email: [
    '📧 Campanha "Black Friday Early" \u2014 24.3% abertura',
    '🔗 312 cliques no CTA "Comprar Agora"',
    '📬 Novo inscrito: pedro@email.com',
  ],
  all: [
    '⚡ Venda #4822 via WhatsApp \u2014 R$ 349,90',
    '📱 Nova conversa Instagram \u2014 @juliana.store',
    '🎯 Meta Ads: CPA caiu 12% na ultima hora',
    '📧 Email "Flash Sale" \u2014 8.2% conversao',
    '🔥 TikTok viral: 89K views em 2h',
    '💳 Checkout concluido \u2014 R$ 129,90',
    '🤖 IA respondeu 34 mensagens automaticamente',
    '📦 12 pedidos prontos para envio',
  ],
};

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
        ctx.strokeStyle = `hsla(${260 + i * 20}, 80%, 60%, ${0.15 + Math.sin(frame * 0.02 + i) * 0.1})`;
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
    <div style={{ overflow: 'hidden', width: '100%', background: 'rgba(139,92,246,0.08)', borderRadius: 8, padding: '8px 0' }}>
      <div style={{ display: 'flex', gap: 40, animation: 'tickerScroll 30s linear infinite', whiteSpace: 'nowrap' }}>
        {doubled.map((m, i) => (
          <span key={i} style={{ fontFamily: MONO, fontSize: 12, color: '#c4b5fd', opacity: 0.8 }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

// ── LiveStream ──
function LiveStream({ msgs }: { msgs: string[] }) {
  const [feed, setFeed] = useState<string[]>([]);
  const idx = useRef(0);
  useEffect(() => {
    const iv = setInterval(() => {
      setFeed(p => [msgs[idx.current % msgs.length], ...p].slice(0, 8));
      idx.current++;
    }, 1200 + Math.random() * 800);
    return () => clearInterval(iv);
  }, [msgs]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {feed.map((m, i) => (
        <div key={i} style={{ fontFamily: MONO, fontSize: 12, color: '#d1d5db', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, animation: 'fadeIn .4s', opacity: 1 - i * 0.1 }}>
          {m}
        </div>
      ))}
    </div>
  );
}

// ── Stat Card ──
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontFamily: SORA, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 22, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════
export default function MarketingView({ defaultTab = 'visao-geral' }: { defaultTab?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(defaultTab);
  const [rev, setRev] = useState(100398);
  const [feed, setFeed] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const [conns, setConns] = useState<Record<string, boolean>>({ whatsapp: true, instagram: true, tiktok: false, facebook: false, email: true });
  const [campStates, setCampStates] = useState<Record<string, string>>({});
  const feedIdx = useRef(0);

  // ── Real data hooks (mock fallback) ──
  const { stats: realStats } = useMarketingStats();
  const { channels: realChannels } = useMarketingChannels();
  const { messages: realFeed } = useMarketingLiveFeed();
  const { brain: realBrain } = useAIBrain();

  // Sync revenue from real stats
  useEffect(() => {
    if (realStats?.totalRevenue) setRev(realStats.totalRevenue);
  }, [realStats]);

  // Merge real feed messages
  useEffect(() => {
    if (realFeed?.length > 0) {
      const mapped = realFeed.map((m: any) => {
        const text = m.text || m.content || '';
        const from = m.from || m.contactName || 'Lead';
        const ch = m.channel || 'whatsapp';
        const isAI = m.isAI || m.direction === 'OUTBOUND';
        const time = m.time || (m.createdAt ? new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
        return `${isAI ? '🤖' : '📱'} [${ch}] ${from}: ${text} (${time})`;
      });
      setFeed(prev => [...mapped, ...prev].slice(0, 30));
    }
  }, [realFeed]);

  // Suppress unused-var warnings for hooks used only for data wiring
  void realChannels;

  // Revenue ticker
  useEffect(() => {
    const iv = setInterval(() => {
      const bump = Math.floor(Math.random() * 400) + 50;
      setRev(p => p + bump);
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }, 3500);
    return () => clearInterval(iv);
  }, []);

  // Feed ticker
  useEffect(() => {
    const iv = setInterval(() => {
      const msgs = STREAM_MSGS.all;
      setFeed(p => [msgs[feedIdx.current % msgs.length], ...p].slice(0, 12));
      feedIdx.current++;
    }, 1200 + Math.random() * 800);
    return () => clearInterval(iv);
  }, []);

  const TABS = [
    { id: 'visao-geral', label: 'Visao Geral', icon: IC.zap },
    { id: 'site', label: 'Site', icon: IC.site },
    { id: 'whatsapp', label: 'WhatsApp', icon: IC.wa },
    { id: 'instagram', label: 'Instagram', icon: IC.ig },
    { id: 'tiktok', label: 'TikTok', icon: IC.tt },
    { id: 'facebook', label: 'Facebook', icon: IC.fb },
    { id: 'email', label: 'Email', icon: IC.em },
    { id: 'meta-ads', label: 'Meta Ads', icon: IC.meta },
    { id: 'tiktok-ads', label: 'TikTok Ads', icon: IC.tads },
    { id: 'google-ads', label: 'Google Ads', icon: IC.gads },
  ];

  const switchTab = (id: string) => {
    setTab(id);
    if (id === 'visao-geral') router.push('/marketing');
    else router.push(`/marketing/${id}`);
  };

  // ── ConnBadge ──
  const ConnBadge = ({ connected }: { connected: boolean }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: MONO, color: connected ? '#22c55e' : '#ef4444', background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 99 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', animation: connected ? 'pulse 2s infinite' : 'none' }} />
      {connected ? 'Conectado' : 'Desconectado'}
    </span>
  );

  // ── ConnectFlow (3-step animation) ──
  const ConnectFlow = ({ channel }: { channel: string }) => {
    const ch = CH[channel];
    if (!ch) return null;
    const [step, setStep] = useState(0);

    useEffect(() => {
      if (step === 1) {
        const t = setTimeout(() => setStep(2), 2000);
        return () => clearTimeout(t);
      }
      if (step === 2) {
        const t = setTimeout(() => {
          setConns(p => ({ ...p, [channel]: true }));
        }, 1500);
        return () => clearTimeout(t);
      }
    }, [step]);

    if (step === 0) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, animation: 'fadeIn .5s' }}>
        <div style={{ color: ch.color, opacity: 0.3 }}>{ch.icon(80)}</div>
        <div style={{ fontFamily: SORA, fontSize: 22, color: '#e5e7eb' }}>Conectar {ch.label}</div>
        <div style={{ fontFamily: SORA, fontSize: 14, color: '#6b7280', maxWidth: 400, textAlign: 'center' }}>
          Conecte sua conta do {ch.label} para comecar a receber mensagens, automatizar respostas e acompanhar metricas em tempo real.
        </div>
        <button onClick={() => setStep(1)} style={{ fontFamily: SORA, fontSize: 14, padding: '12px 32px', borderRadius: 12, border: 'none', background: ch.color, color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          {IC.key(16)} Conectar {ch.label}
        </button>
      </div>
    );

    if (step === 1) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, animation: 'fadeIn .5s' }}>
        <div style={{ color: ch.color, animation: 'spin 2s linear infinite' }}>{ch.icon(60)}</div>
        <div style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>Autenticando {ch.label}...</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: ch.color }}>Aguarde enquanto validamos sua conta</div>
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, animation: 'fadeIn .5s' }}>
        <div style={{ color: '#22c55e' }}>{IC.check(60)}</div>
        <div style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>{ch.label} Conectado!</div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: '#22c55e' }}>Sincronizando dados...</div>
      </div>
    );
  };

  // ── SiteBuilder (3 phases: ask/building/editor with full preview) ──
  const SiteBuilder = () => {
    const [phase, setPhase] = useState<'ask' | 'building' | 'editor'>('ask');
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      if (phase !== 'building') return;
      const iv = setInterval(() => {
        setProgress(p => {
          if (p >= 100) { setPhase('editor'); return 100; }
          return p + 2;
        });
      }, 80);
      return () => clearInterval(iv);
    }, [phase]);

    if (phase === 'ask') return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, animation: 'fadeIn .5s' }}>
        <div style={{ color: '#8b5cf6', opacity: 0.3 }}>{IC.globe(80)}</div>
        <div style={{ fontFamily: SORA, fontSize: 22, color: '#e5e7eb' }}>Criar seu Site</div>
        <div style={{ fontFamily: SORA, fontSize: 14, color: '#6b7280', maxWidth: 400, textAlign: 'center' }}>
          A IA vai gerar um site completo baseado nos seus produtos, marca e publico-alvo. Pronto em segundos.
        </div>
        <button onClick={() => setPhase('building')} style={{ fontFamily: SORA, fontSize: 14, padding: '12px 32px', borderRadius: 12, border: 'none', background: '#8b5cf6', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          {IC.zap(16)} Gerar Site com IA
        </button>
      </div>
    );

    if (phase === 'building') return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, animation: 'fadeIn .5s' }}>
        <div style={{ color: '#8b5cf6', animation: 'spin 2s linear infinite' }}>{IC.globe(60)}</div>
        <div style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>Construindo seu site...</div>
        <div style={{ width: 300, height: 6, background: 'rgba(139,92,246,0.2)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#8b5cf6', borderRadius: 99, width: `${progress}%`, transition: 'width .3s' }} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: '#8b5cf6' }}>{progress}%</div>
      </div>
    );

    return (
      <div style={{ animation: 'fadeIn .5s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>Editor do Site</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ fontFamily: SORA, fontSize: 12, padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: 'transparent', color: '#c4b5fd', cursor: 'pointer' }}>Preview</button>
            <button style={{ fontFamily: SORA, fontSize: 12, padding: '6px 16px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: '#fff', cursor: 'pointer' }}>Publicar</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, minHeight: 400 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            {['Header', 'Hero', 'Produtos', 'Depoimentos', 'Footer'].map(s => (
              <div key={s} style={{ fontFamily: SORA, fontSize: 13, color: '#d1d5db', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: 'rgba(139,92,246,0.05)' }}>{s}</div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 20, border: '1px dashed rgba(139,92,246,0.2)' }}>
            {/* Full Preview */}
            <div style={{ borderRadius: 8, overflow: 'hidden', background: '#000' }}>
              <div style={{ background: 'rgba(139,92,246,0.1)', padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontFamily: SORA, fontSize: 24, fontWeight: 700, color: '#e5e7eb', marginBottom: 8 }}>Kloel Store</div>
                <div style={{ fontFamily: SORA, fontSize: 14, color: '#9ca3af' }}>Os melhores produtos digitais para sua transformacao</div>
              </div>
              <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {PRODUCTS.map((p, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{p.img}</div>
                    <div style={{ fontFamily: SORA, fontSize: 12, color: '#d1d5db' }}>{p.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, color: '#8b5cf6', marginTop: 4 }}>{FmtMoney(p.price)}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280' }}>Selecione uma secao para editar</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── WhatsAppTab (split chat list + 6-message conversation) ──
  const WhatsAppTab = () => {
    if (!conns.whatsapp) return <ConnectFlow channel="whatsapp" />;
    const ch = CH.whatsapp;
    const chatList = [
      { name: 'Joao Silva', last: 'Opa, quero 2 camisetas!', time: '14:32', unread: 3 },
      { name: 'Maria Lima', last: 'Tem PP?', time: '14:28', unread: 1 },
      { name: 'Carlos Mendes', last: 'Chegou certinho, obrigado!', time: '14:15', unread: 0 },
      { name: 'Ana Costa', last: 'Qual o prazo pro RJ?', time: '13:58', unread: 2 },
      { name: 'Pedro Santos', last: 'Vou querer o bone tambem', time: '13:42', unread: 0 },
    ];
    const conversation = [
      { from: 'Joao Silva', text: 'Oi! Vi a camiseta oversized no Insta', time: '14:28', mine: false },
      { from: 'IA Kloel', text: 'Ola Joao! Sim, temos a Camiseta Oversized Preta em estoque. Posso te ajudar com tamanhos?', time: '14:28', mine: true },
      { from: 'Joao Silva', text: 'Quero 2, uma M e uma G', time: '14:30', mine: false },
      { from: 'IA Kloel', text: 'Perfeito! 2x Camiseta Oversized Preta (M + G) = R$ 259,80. Gero o link de pagamento?', time: '14:30', mine: true },
      { from: 'Joao Silva', text: 'Gera sim!', time: '14:31', mine: false },
      { from: 'IA Kloel', text: 'Pronto! Aqui esta seu link: pay.kloel.com/4821 - PIX ou cartao, como preferir 😉', time: '14:32', mine: true },
    ];
    return (
      <div style={{ animation: 'fadeIn .5s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ch.color }}>{ch.icon(24)}</span>
            <span style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>{ch.label}</span>
            <ConnBadge connected />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280' }}>{ch.account}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Mensagens" value={Fmt(ch.msgs)} color={ch.color} />
          <StatCard label="Leads" value={Fmt(ch.leads)} color={ch.color} />
          <StatCard label="Vendas" value={ch.sales.toString()} color={ch.color} />
          <StatCard label="Receita" value={FmtMoney(ch.revenue)} color={ch.color} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, minHeight: 340 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontFamily: SORA, fontSize: 13, color: '#9ca3af' }}>Conversas ({ch.convos})</div>
            {chatList.map((c, i) => (
              <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: i === 0 ? 'rgba(37,211,102,0.05)' : 'transparent' }}>
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 13, color: '#e5e7eb' }}>{c.name}</div>
                  <div style={{ fontFamily: SORA, fontSize: 11, color: '#6b7280', marginTop: 2 }}>{c.last}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: '#6b7280' }}>{c.time}</span>
                  {c.unread > 0 && <span style={{ background: ch.color, color: '#fff', fontSize: 10, fontFamily: MONO, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread}</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: SORA, fontSize: 13, color: '#9ca3af', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Joao Silva</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: '#22c55e' }}>IA ativa</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {conversation.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%', padding: '8px 12px', borderRadius: 12,
                    background: msg.mine ? 'rgba(37,211,102,0.15)' : 'rgba(255,255,255,0.05)',
                    borderBottomRightRadius: msg.mine ? 4 : 12,
                    borderBottomLeftRadius: msg.mine ? 12 : 4,
                  }}>
                    <div style={{ fontFamily: SORA, fontSize: 12, color: '#e5e7eb' }}>{msg.text}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: '#6b7280', marginTop: 4, textAlign: 'right' }}>
                      {msg.mine && '🤖 '}{msg.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input placeholder="Mensagem..." style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#e5e7eb', fontFamily: SORA, fontSize: 12, outline: 'none' }} />
              <button style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: ch.color, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>{IC.send(14)}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── InstagramTab (4 pink stats + engagement bars + top content) ──
  const InstagramTab = () => {
    if (!conns.instagram) return <ConnectFlow channel="instagram" />;
    const ch = CH.instagram;
    const engagement = [
      { label: 'Reels', pct: 78 },
      { label: 'Stories', pct: 62 },
      { label: 'Posts', pct: 45 },
      { label: 'Lives', pct: 31 },
    ];
    const topContent = [
      { type: 'Reels', title: 'Unboxing Summer Drop', views: '45.2K', likes: '3.8K' },
      { type: 'Story', title: 'Flash Sale 24h', views: '22.1K', likes: '1.2K' },
      { type: 'Post', title: 'Nova Colecao', views: '18.7K', likes: '2.4K' },
    ];
    return (
      <div style={{ animation: 'fadeIn .5s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ch.color }}>{ch.icon(24)}</span>
            <span style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>{ch.label}</span>
            <ConnBadge connected />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280' }}>{ch.account}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Mensagens DM" value={Fmt(ch.msgs)} color={ch.color} />
          <StatCard label="Leads" value={Fmt(ch.leads)} color={ch.color} />
          <StatCard label="Vendas" value={ch.sales.toString()} color={ch.color} />
          <StatCard label="Receita" value={FmtMoney(ch.revenue)} color={ch.color} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Engajamento por Formato</div>
            {engagement.map(e => (
              <div key={e.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SORA, fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                  <span>{e.label}</span><span>{e.pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(225,48,108,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${e.pct}%`, background: ch.color, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Top Conteudo</div>
            {topContent.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: ch.color, background: 'rgba(225,48,108,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 8 }}>{c.type}</span>
                  <span style={{ fontFamily: SORA, fontSize: 13, color: '#d1d5db' }}>{c.title}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>{c.views} views &middot; {c.likes} likes</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Feed ao Vivo</div>
          <LiveStream msgs={STREAM_MSGS.instagram} />
        </div>
      </div>
    );
  };

  // ── TikTokTab (5 red stats + videos + audience demographics) ──
  const TikTokTab = () => {
    if (!conns.tiktok) return <ConnectFlow channel="tiktok" />;
    const ch = CH.tiktok;
    const videos = [
      { title: 'Unboxing Kloel Summer', views: '89.2K', likes: '12.4K', shares: '3.2K', comments: '892' },
      { title: 'POV: Meu pedido chegou', views: '45.1K', likes: '6.8K', shares: '1.5K', comments: '423' },
      { title: 'Outfit do dia ft. Kloel', views: '32.7K', likes: '4.2K', shares: '980', comments: '312' },
    ];
    const demographics = [
      { label: '18-24', pct: 42 },
      { label: '25-34', pct: 35 },
      { label: '35-44', pct: 15 },
      { label: '45+', pct: 8 },
    ];
    return (
      <div style={{ animation: 'fadeIn .5s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ch.color }}>{ch.icon(24)}</span>
            <span style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>{ch.label}</span>
            <ConnBadge connected={false} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280' }}>{ch.account}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Views Totais" value="167K" color={ch.color} />
          <StatCard label="Seguidores" value="23.4K" color={ch.color} />
          <StatCard label="Leads" value={Fmt(ch.leads)} color={ch.color} />
          <StatCard label="Vendas" value={ch.sales.toString()} color={ch.color} />
          <StatCard label="Receita" value={FmtMoney(ch.revenue)} color={ch.color} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Videos Recentes</div>
            {videos.map((v, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ fontFamily: SORA, fontSize: 13, color: '#d1d5db', marginBottom: 4 }}>{v.title}</div>
                <div style={{ display: 'flex', gap: 12, fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>
                  <span>{v.views} views</span><span>{v.likes} likes</span><span>{v.shares} shares</span><span>{v.comments} comments</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Audiencia por Idade</div>
            {demographics.map(d => (
              <div key={d.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SORA, fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                  <span>{d.label}</span><span>{d.pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,0,80,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.pct}%`, background: ch.color, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Feed ao Vivo</div>
          <LiveStream msgs={STREAM_MSGS.tiktok} />
        </div>
      </div>
    );
  };

  // ── FacebookTab (4 blue stats + demographics + origin) ──
  const FacebookTab = () => {
    if (!conns.facebook) return <ConnectFlow channel="facebook" />;
    const ch = CH.facebook;
    const demographics = [
      { label: 'Mulheres 25-34', pct: 38 },
      { label: 'Homens 25-34', pct: 28 },
      { label: 'Mulheres 18-24', pct: 18 },
      { label: 'Homens 18-24', pct: 16 },
    ];
    const traffic = [
      { source: 'Feed', pct: 45 },
      { source: 'Marketplace', pct: 25 },
      { source: 'Groups', pct: 18 },
      { source: 'Messenger', pct: 12 },
    ];
    return (
      <div style={{ animation: 'fadeIn .5s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ch.color }}>{ch.icon(24)}</span>
            <span style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>{ch.label}</span>
            <ConnBadge connected={false} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280' }}>{ch.account}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Mensagens" value={Fmt(ch.msgs)} color={ch.color} />
          <StatCard label="Leads" value={Fmt(ch.leads)} color={ch.color} />
          <StatCard label="Vendas" value={ch.sales.toString()} color={ch.color} />
          <StatCard label="Receita" value={FmtMoney(ch.revenue)} color={ch.color} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Demografia</div>
            {demographics.map(d => (
              <div key={d.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SORA, fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                  <span>{d.label}</span><span>{d.pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(24,119,242,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.pct}%`, background: ch.color, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Origem do Trafego</div>
            {traffic.map(t => (
              <div key={t.source} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SORA, fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                  <span>{t.source}</span><span>{t.pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(24,119,242,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${t.pct}%`, background: ch.color, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Feed ao Vivo</div>
          <LiveStream msgs={STREAM_MSGS.facebook} />
        </div>
      </div>
    );
  };

  // ── EmailTab (5 stats + funnel visual + last dispatches) ──
  const EmailTab = () => {
    if (!conns.email) return <ConnectFlow channel="email" />;
    const ch = CH.email;
    const funnel = [
      { label: 'Enviados', value: 24300, pct: 100 },
      { label: 'Entregues', value: 23100, pct: 95 },
      { label: 'Abertos', value: 5600, pct: 23 },
      { label: 'Clicados', value: 1890, pct: 8 },
      { label: 'Convertidos', value: 410, pct: 1.7 },
    ];
    const dispatches = [
      { name: 'Flash Sale Weekend', sent: '12.4K', open: '24.3%', click: '8.2%', date: '26 Mar' },
      { name: 'Novidades de Marco', sent: '11.9K', open: '21.1%', click: '6.8%', date: '22 Mar' },
      { name: 'Carrinho Abandonado', sent: '3.2K', open: '38.7%', click: '14.2%', date: '20 Mar' },
    ];
    return (
      <div style={{ animation: 'fadeIn .5s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ch.color }}>{ch.icon(24)}</span>
            <span style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>{ch.label}</span>
            <ConnBadge connected />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 12, color: '#6b7280' }}>{ch.account}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Enviados" value={Fmt(ch.msgs)} color={ch.color} />
          <StatCard label="Taxa Abertura" value="23%" color={ch.color} />
          <StatCard label="Leads" value={Fmt(ch.leads)} color={ch.color} />
          <StatCard label="Vendas" value={ch.sales.toString()} color={ch.color} />
          <StatCard label="Receita" value={FmtMoney(ch.revenue)} color={ch.color} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Funil de Email</div>
            {funnel.map((f, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SORA, fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
                  <span>{f.label}</span><span>{Fmt(f.value)} ({f.pct}%)</span>
                </div>
                <div style={{ height: 8, background: 'rgba(245,158,11,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${f.pct}%`, background: ch.color, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Ultimos Envios</div>
            {dispatches.map((d, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: SORA, fontSize: 13, color: '#d1d5db' }}>{d.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>{d.date}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>
                  <span>Enviados: {d.sent}</span><span>Abertura: {d.open}</span><span>Cliques: {d.click}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Feed ao Vivo</div>
          <LiveStream msgs={STREAM_MSGS.email} />
        </div>
      </div>
    );
  };

  // ── AdsTab (all 3 platforms with 6 stats + campaign table + rules + Google keywords) ──
  const AdsTab = ({ platform }: { platform: string }) => {
    const ad = ADS[platform];
    if (!ad) return null;
    const totals = ad.campaigns.reduce((a, c) => ({ spend: a.spend + c.spend, imp: a.imp + c.impressions, clicks: a.clicks + c.clicks, conv: a.conv + c.conversions }), { spend: 0, imp: 0, clicks: 0, conv: 0 });
    const ctr = totals.imp > 0 ? ((totals.clicks / totals.imp) * 100).toFixed(2) : '0.00';
    const cpa = totals.conv > 0 ? (totals.spend / totals.conv).toFixed(2) : '0.00';

    const googleKeywords = [
      { keyword: 'curso ia marketing', cpc: 2.45, impressions: 12400, clicks: 890, conversions: 42, position: 1.8 },
      { keyword: 'ebook funil vendas', cpc: 1.89, impressions: 8200, clicks: 620, conversions: 31, position: 2.1 },
      { keyword: 'mentoria digital', cpc: 3.12, impressions: 5600, clicks: 410, conversions: 18, position: 1.5 },
      { keyword: 'marketing digital curso', cpc: 2.78, impressions: 15800, clicks: 1200, conversions: 56, position: 2.4 },
      { keyword: 'como vender online', cpc: 1.56, impressions: 22000, clicks: 1680, conversions: 63, position: 3.2 },
    ];

    return (
      <div style={{ animation: 'fadeIn .5s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ color: ad.color }}>{ad.icon(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: '#e5e7eb' }}>{ad.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Gasto Total" value={FmtMoney(totals.spend)} color={ad.color} />
          <StatCard label="Impressoes" value={Fmt(totals.imp)} color={ad.color} />
          <StatCard label="Cliques" value={Fmt(totals.clicks)} color={ad.color} />
          <StatCard label="CTR" value={ctr + '%'} color={ad.color} />
          <StatCard label="Conversoes" value={totals.conv.toString()} color={ad.color} />
          <StatCard label="CPA" value={'R$ ' + cpa} color={ad.color} />
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Campanhas</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontFamily: SORA, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Campanha</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Gasto</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Impressoes</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Cliques</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Conv.</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>CPA</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Acao</th>
                </tr>
              </thead>
              <tbody>
                {ad.campaigns.map((c, i) => {
                  const stateKey = `${platform}-${i}`;
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
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>R$ {c.cpa.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button onClick={() => setCampStates(p => ({ ...p, [stateKey]: st === 'active' ? 'paused' : 'active' }))} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#9ca3af', display: 'inline-flex', alignItems: 'center' }}>
                          {st === 'active' ? IC.pause(12) : IC.play(12)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Regras Automatizadas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { rule: 'Pausar campanha se CPA > R$ 25', status: 'on' },
              { rule: 'Aumentar 10% budget se ROAS > 3x', status: 'on' },
              { rule: 'Alertar se CTR < 1%', status: 'off' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                <span style={{ fontFamily: SORA, fontSize: 13, color: '#d1d5db' }}>{r.rule}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: r.status === 'on' ? '#22c55e' : '#6b7280' }}>{r.status === 'on' ? 'ATIVO' : 'OFF'}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Google Keywords (only for google-ads) */}
        {platform === 'google-ads' && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              {IC.search(16)} Palavras-chave
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ fontFamily: SORA, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>Palavra-chave</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>CPC</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>Impressoes</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>Cliques</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>Conv.</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>Posicao</th>
                  </tr>
                </thead>
                <tbody>
                  {googleKeywords.map((kw, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#d1d5db' }}>{kw.keyword}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>R$ {kw.cpc.toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{Fmt(kw.impressions)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{Fmt(kw.clicks)}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>{kw.conversions}</td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: ad.color, textAlign: 'right' }}>{kw.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── VisaoGeral (80px revenue glow + flash + ticker scroll + nerve fibers + AI brain) ──
  const VisaoGeral = () => {
    const totalRevenue = Object.values(CH).reduce((a, c) => a + c.revenue, 0) + rev - 100398;
    return (
      <div style={{ animation: 'fadeIn .5s' }}>
        {/* Revenue Hero */}
        <div style={{ position: 'relative', textAlign: 'center', padding: '40px 0 30px', marginBottom: 24, overflow: 'hidden', borderRadius: 16, background: 'rgba(139,92,246,0.04)' }}>
          <NP w={800} h={160} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: SORA, fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 2 }}>Receita Total Tempo Real</div>
            <div style={{
              fontFamily: MONO, fontSize: 80, fontWeight: 700, color: '#a78bfa', marginTop: 8,
              textShadow: flash ? '0 0 40px rgba(139,92,246,0.8), 0 0 80px rgba(139,92,246,0.4)' : '0 0 20px rgba(139,92,246,0.3)',
              transition: 'text-shadow .3s',
              animation: flash ? 'glow .6s' : 'none',
            }}>
              R$ {totalRevenue.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#22c55e', marginTop: 4 }}>+R$ {(rev - 100398).toLocaleString('pt-BR')} hoje</div>
          </div>
        </div>

        {/* Ticker */}
        <Ticker items={STREAM_MSGS.all} />

        {/* Channel Cards (nerve fibers) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 20 }}>
          {Object.entries(CH).map(([key, ch]) => (
            <div key={key} onClick={() => switchTab(key)} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, cursor: 'pointer', borderLeft: `3px solid ${ch.color}`, transition: 'all .2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ color: ch.color }}>{ch.icon(18)}</span>
                <span style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb' }}>{ch.label}</span>
                <ConnBadge connected={conns[key] ?? false} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div><span style={{ fontFamily: SORA, fontSize: 10, color: '#6b7280' }}>Msgs</span><div style={{ fontFamily: MONO, fontSize: 14, color: '#d1d5db' }}>{Fmt(ch.msgs)}</div></div>
                <div><span style={{ fontFamily: SORA, fontSize: 10, color: '#6b7280' }}>Leads</span><div style={{ fontFamily: MONO, fontSize: 14, color: '#d1d5db' }}>{Fmt(ch.leads)}</div></div>
                <div><span style={{ fontFamily: SORA, fontSize: 10, color: '#6b7280' }}>Vendas</span><div style={{ fontFamily: MONO, fontSize: 14, color: '#d1d5db' }}>{ch.sales}</div></div>
                <div><span style={{ fontFamily: SORA, fontSize: 10, color: '#6b7280' }}>Receita</span><div style={{ fontFamily: MONO, fontSize: 14, color: ch.color }}>{FmtMoney(ch.revenue)}</div></div>
              </div>
            </div>
          ))}
        </div>

        {/* Products */}
        <div style={{ marginTop: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Produtos Mais Vendidos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {PRODUCTS.map((p, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 28 }}>{p.img}</div>
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 12, color: '#d1d5db' }}>{p.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: '#a78bfa' }}>{FmtMoney(p.price)}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: '#6b7280' }}>{p.sold} vendidos</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Brain + Feed */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
          <div style={{ background: 'rgba(139,92,246,0.05)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ color: '#8b5cf6', animation: 'pulse 3s infinite', marginBottom: 12 }}>{IC.zap(40)}</div>
            <div style={{ fontFamily: SORA, fontSize: 16, color: '#e5e7eb', marginBottom: 4 }}>IA Kloel {realBrain?.status === 'active' ? 'Ativa' : 'Ativa'}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#8b5cf6' }}>{realBrain?.activeConversations || 34} respostas automaticas / ultima hora</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#6b7280', marginTop: 4 }}>Produtos: {realBrain?.productsLoaded || 12} &middot; Objecoes: {realBrain?.objectionsMapped || 48}</div>
            {realBrain?.avgResponseTime && <div style={{ fontFamily: MONO, fontSize: 11, color: '#6b7280', marginTop: 2 }}>Tempo medio: {realBrain.avgResponseTime}</div>}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 14, color: '#e5e7eb', marginBottom: 12 }}>Feed em Tempo Real</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {feed.slice(0, 8).map((m, i) => (
                <div key={i} style={{ fontFamily: MONO, fontSize: 12, color: '#d1d5db', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, animation: 'fadeIn .4s', opacity: 1 - i * 0.1 }}>
                  {m}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Render Tab Content ──
  const renderTab = () => {
    switch (tab) {
      case 'visao-geral': return <VisaoGeral />;
      case 'site': return <SiteBuilder />;
      case 'whatsapp': return <WhatsAppTab />;
      case 'instagram': return <InstagramTab />;
      case 'tiktok': return <TikTokTab />;
      case 'facebook': return <FacebookTab />;
      case 'email': return <EmailTab />;
      case 'meta-ads': return <AdsTab platform="meta-ads" />;
      case 'tiktok-ads': return <AdsTab platform="tiktok-ads" />;
      case 'google-ads': return <AdsTab platform="google-ads" />;
      default: return <VisaoGeral />;
    }
  };

  return (
    <div style={{ fontFamily: SORA, color: '#e5e7eb', minHeight: '100vh', padding: 24 }}>
      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideIn { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes glow { 0% { text-shadow: 0 0 20px rgba(139,92,246,0.3); } 50% { text-shadow: 0 0 60px rgba(139,92,246,0.9), 0 0 120px rgba(139,92,246,0.5); } 100% { text-shadow: 0 0 20px rgba(139,92,246,0.3); } }
        @keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
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
              background: tab === t.id ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: tab === t.id ? '#c4b5fd' : '#6b7280',
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
