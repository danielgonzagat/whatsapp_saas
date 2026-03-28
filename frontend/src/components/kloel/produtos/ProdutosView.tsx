'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProducts } from '@/hooks/useProducts';
import { useMemberAreas } from '@/hooks/useMemberAreas';

// ═══════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════
const VOID   = '#0A0A0C';
const SURF   = '#111113';
const ELEV   = '#19191C';
const BRD    = '#222226';
const GLOW   = '#333338';
const SILVER = '#E0DDD8';
const MUTED  = '#6E6E73';
const DIM    = '#3A3A3F';
const EMBER  = '#E85D30';
const PURPLE = '#8B5CF6';
const GREEN  = '#22C55E';
const SORA   = "var(--font-sora), 'Sora', sans-serif";
const MONO   = "var(--font-jetbrains), 'JetBrains Mono', monospace";

// ═══════════════════════════════════════════════
// INLINE SVG ICONS (IC)
// ═══════════════════════════════════════════════
const IC: Record<string, (s: number) => React.ReactElement> = {
  revenue: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  ),
  sales: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  ),
  active: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  ),
  package: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  ),
  students: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ),
  book: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
  ),
  chart: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  ),
  star: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  ),
  sparkle: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
  ),
  search: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  ),
  fire: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={EMBER} stroke="none"><path d="M12 23c-4.97 0-8-3.58-8-7.5 0-3.07 1.74-5.44 3.28-7.17.56-.63 1.12-1.2 1.58-1.73.32-.37.6-.72.82-1.08C10.37 4.4 10.73 3 11.2 1.5c.12-.38.62-.42.8-.07.68 1.31 1.56 3.15 2.2 4.85.31.83.56 1.62.7 2.32.07.35.36.63.72.67.36.04.7-.16.85-.48.24-.52.44-1.09.6-1.69.1-.38.56-.5.78-.17C19.5 9.62 20 12.09 20 15.5 20 19.42 16.97 23 12 23Z"/></svg>
  ),
  trendUp: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
  ),
  chevLeft: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
  ),
  chevRight: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  ),
  check: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  ),
  arrowRight: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  ),
  arrowLeft: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
  ),
  filter: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
  ),
  copy: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  ),
  community: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ),
  globe: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  ),
  shield: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  ai: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={EMBER} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  heartFill: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={EMBER} stroke={EMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  ),
  heartOutline: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  ),
  certificate: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
  ),
  funnel: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
  ),
};

// ═══════════════════════════════════════════════
// MOCK DATA — Meus Produtos
// ═══════════════════════════════════════════════
const PRODUCTS = [
  { id: 'p1', name: 'Curso Marketing Digital Pro', status: 'APPROVED', price: 497, sales: 234, revenue: 116298, format: 'CURSO', updated: '2026-03-25' },
  { id: 'p2', name: 'E-book Funil de Vendas', status: 'APPROVED', price: 47, sales: 892, revenue: 41924, format: 'EBOOK', updated: '2026-03-24' },
  { id: 'p3', name: 'Comunidade Empreendedores', status: 'APPROVED', price: 97, sales: 156, revenue: 15132, format: 'COMUNIDADE', updated: '2026-03-23' },
  { id: 'p4', name: 'Kit Planilhas Financeiras', status: 'PENDING', price: 37, sales: 0, revenue: 0, format: 'DIGITAL', updated: '2026-03-22' },
  { id: 'p5', name: 'Mentoria Premium 1-1', status: 'DRAFT', price: 2997, sales: 12, revenue: 35964, format: 'SERVICO', updated: '2026-03-20' },
];

// ═══════════════════════════════════════════════
// MOCK DATA — Area de Membros
// ═══════════════════════════════════════════════
const AREAS = [
  { id: 'a1', name: 'Academia de Marketing', type: 'COURSE', students: 1247, modules: 12, completion: 68, status: 'active' },
  { id: 'a2', name: 'Clube de Empreendedores', type: 'COMMUNITY', students: 534, modules: 0, completion: 0, status: 'active' },
  { id: 'a3', name: 'Formacao Dev Full Stack', type: 'HYBRID', students: 312, modules: 24, completion: 45, status: 'active' },
  { id: 'a4', name: 'Mentoria Executiva', type: 'MEMBERSHIP', students: 89, modules: 8, completion: 72, status: 'active' },
];

// ═══════════════════════════════════════════════
// MOCK DATA — Marketplace (Afiliar-se)
// ═══════════════════════════════════════════════
const MARKETPLACE = [
  { id: 'm1', name: 'Metodo Emagrecer de Vez', category: 'Saude', commission: 50, price: 297, rating: 4.8, sales: 12400, temperature: 95, producer: 'Dr. Carlos Lima' },
  { id: 'm2', name: 'Formula Negocio Online', category: 'Negocios', commission: 60, price: 497, rating: 4.9, sales: 45200, temperature: 98, producer: 'Alex Vargas' },
  { id: 'm3', name: 'Curso Instagram Pro', category: 'Marketing', commission: 40, price: 197, rating: 4.6, sales: 8900, temperature: 82, producer: 'Camila Digital' },
  { id: 'm4', name: 'Kit Receitas Fit', category: 'Culinaria', commission: 45, price: 67, rating: 4.5, sales: 6700, temperature: 74, producer: 'Chef Renata' },
  { id: 'm5', name: 'Trader Profissional', category: 'Financas', commission: 55, price: 997, rating: 4.7, sales: 3200, temperature: 88, producer: 'Lucas Trade' },
  { id: 'm6', name: 'Ingles em 90 Dias', category: 'Educacao', commission: 35, price: 397, rating: 4.4, sales: 15800, temperature: 91, producer: 'Teacher Mike' },
];

// ═══════════════════════════════════════════════
// NeuralPulse (NP) — animated dot
// ═══════════════════════════════════════════════
function NP({ color = EMBER, size = 8 }: { color?: string; size?: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: color, animation: 'pulse 2s ease-in-out infinite',
      }} />
      <span style={{
        position: 'absolute', inset: -2, borderRadius: '50%',
        background: color, opacity: 0.3, animation: 'pulse 2s ease-in-out infinite 0.3s',
      }} />
    </span>
  );
}

// ═══════════════════════════════════════════════
// Ticker — scrolling horizontal text
// ═══════════════════════════════════════════════
function Ticker({ items, color = EMBER }: { items: string[]; color?: string }) {
  const text = items.join('  ///  ');
  return (
    <div style={{
      overflow: 'hidden', width: '100%', background: SURF,
      borderTop: `1px solid ${BRD}`, borderBottom: `1px solid ${BRD}`,
      padding: '6px 0',
    }}>
      <div style={{
        display: 'inline-block', whiteSpace: 'nowrap',
        animation: 'tickerScroll 30s linear infinite',
        fontFamily: MONO, fontSize: 11, color: color, opacity: 0.7,
      }}>
        {text}&nbsp;&nbsp;&nbsp;///&nbsp;&nbsp;&nbsp;{text}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// LiveFeed — small event list
// ═══════════════════════════════════════════════
function LiveFeed({ events, color = EMBER }: { events: { text: string; time: string }[]; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((ev, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: SURF, borderRadius: 6,
          border: `1px solid ${BRD}`, animation: `fadeIn 0.3s ease ${i * 0.1}s both`,
        }}>
          <NP color={color} size={6} />
          <span style={{ fontFamily: SORA, fontSize: 12, color: SILVER, flex: 1 }}>{ev.text}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: DIM }}>{ev.time}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
// CSS Animations (injected once)
// ═══════════════════════════════════════════════
const ANIMATIONS = `
@keyframes glow {
  0%, 100% { opacity: 0.6; filter: blur(20px); }
  50% { opacity: 1; filter: blur(30px); }
}
@keyframes tickerScroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.4; }
}
@keyframes slideIn {
  0% { transform: translateY(12px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes fadeIn {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
`;

// ═══════════════════════════════════════════════
// TAB CONFIG
// ═══════════════════════════════════════════════
const TABS = [
  { key: 'produtos', label: 'Meus Produtos', color: EMBER, route: '/products' },
  { key: 'membros',  label: 'Area de Membros', color: PURPLE, route: '/produtos/area-membros' },
  { key: 'afiliar',  label: 'Afiliar-se', color: GREEN, route: '/produtos/afiliar-se' },
];

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
interface ProdutosViewProps {
  defaultTab?: string;
}

export default function ProdutosView({ defaultTab = 'produtos' }: ProdutosViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [search, setSearch] = useState('');
  const [selectedMarketItem, setSelectedMarketItem] = useState<any>(null);

  // ── Real data hooks (mock fallback) ──
  const { products: realProducts } = useProducts();
  const { areas: realAreas } = useMemberAreas();

  const displayProducts = (realProducts && realProducts.length > 0)
    ? realProducts.map((p: any) => ({
        id: p.id, name: p.name, status: p.active !== false ? 'APPROVED' : 'DRAFT',
        price: p.price || 0, sales: p.totalSales || p.sales || 0,
        revenue: p.totalRevenue || p.revenue || 0,
        format: p.format || p.category || 'DIGITAL',
        updated: p.updatedAt || p.updated || '',
      }))
    : PRODUCTS;

  const displayAreas = (realAreas && realAreas.length > 0)
    ? realAreas.map((a: any) => ({
        id: a.id, name: a.name, type: a.type || 'COURSE',
        students: a.studentsCount || a.students || 0,
        modules: a.modulesCount || a.modules || 0,
        completion: a.avgCompletion || a.completion || 0,
        status: a.status || 'active',
      }))
    : AREAS;

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key);
    const tab = TABS.find(t => t.key === key);
    if (tab) router.push(tab.route);
  }, [router]);

  const currentColor = TABS.find(t => t.key === activeTab)?.color || EMBER;

  // ── Revenue / stat formatters ──
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const fmtBRL = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  // ── Derived stats ──
  const totalRevenue = displayProducts.reduce((s: number, p: any) => s + (p.revenue || 0), 0);
  const totalSales = displayProducts.reduce((s: number, p: any) => s + (p.sales || 0), 0);
  const activeProducts = displayProducts.filter((p: any) => p.status === 'APPROVED').length;
  const totalStudents = displayAreas.reduce((s: number, a: any) => s + (a.students || 0), 0);
  const areasWithCompletion = displayAreas.filter((a: any) => a.completion > 0);
  const avgCompletion = areasWithCompletion.length > 0 ? Math.round(areasWithCompletion.reduce((s: number, a: any) => s + a.completion, 0) / areasWithCompletion.length) : 0;
  const totalEarnings = 14634.50;

  // ═════════════════════════════════
  // TAB: Meus Produtos
  // ═════════════════════════════════
  const MeusProdutos = () => {
    const revenueBars = [65, 80, 45, 90, 55, 72, 88];
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

    return (
      <div style={{ animation: 'slideIn 0.4s ease' }}>
        {/* Revenue Hero — 80px glow */}
        <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 200, height: 80, borderRadius: '50%',
            background: `radial-gradient(ellipse, ${EMBER}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>
              Receita Total
            </div>
            <div style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, color: SILVER, letterSpacing: '-0.02em' }}>
              {fmtBRL(totalRevenue)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
              <NP color={EMBER} />
              <span style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>+18.4% vs mes anterior</span>
            </div>
          </div>
        </div>

        {/* Ticker */}
        <Ticker
          items={displayProducts.map((p: any) => `${p.name}: ${fmt(p.sales)} vendas`)}
          color={EMBER}
        />

        {/* Nerve Fibers — stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '20px 0' }}>
          {[
            { icon: IC.revenue, label: 'Receita', value: fmtBRL(totalRevenue), sub: '+18.4%' },
            { icon: IC.sales, label: 'Vendas', value: String(totalSales), sub: '+12 hoje' },
            { icon: IC.active, label: 'Ativos', value: String(activeProducts), sub: `de ${displayProducts.length}` },
          ].map((s, i) => (
            <div key={i} style={{
              background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 16,
              animation: `fadeIn 0.3s ease ${i * 0.1}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ color: EMBER }}>{s.icon(18)}</span>
                <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: SILVER }}>{s.value}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: EMBER, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Revenue Bars */}
        <div style={{ background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER, marginBottom: 16 }}>Receita Semanal</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {revenueBars.map((v, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: v, background: `linear-gradient(to top, ${EMBER}30, ${EMBER})`,
                  borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease',
                  animation: `fadeIn 0.4s ease ${i * 0.08}s both`,
                }} />
                <div style={{ fontFamily: MONO, fontSize: 9, color: DIM, marginTop: 4 }}>{days[i]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Motor IA */}
        <div style={{
          background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 20, marginBottom: 16,
          borderLeft: `3px solid ${EMBER}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: EMBER }}>{IC.sparkle(16)}</span>
            <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER }}>Motor IA</span>
            <NP color={EMBER} size={6} />
          </div>
          <div style={{ fontFamily: SORA, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
            Seu produto &quot;Curso Marketing Digital Pro&quot; tem potencial de +32% em conversao.
            Sugestao: adicionar depoimentos na pagina de vendas e criar um funil de email com 5 mensagens.
          </div>
        </div>

        {/* Funil */}
        <div style={{ background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ color: EMBER }}>{IC.funnel(16)}</span>
            <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER }}>Funil de Vendas</span>
          </div>
          {[
            { label: 'Visitantes', value: 12480, pct: 100 },
            { label: 'Checkout', value: 3120, pct: 25 },
            { label: 'Pagamento', value: 1560, pct: 12.5 },
            { label: 'Aprovado', value: 1294, pct: 10.4 },
          ].map((stage, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 11, color: MUTED }}>{stage.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: SILVER }}>{fmt(stage.value)} ({stage.pct}%)</span>
              </div>
              <div style={{ height: 4, background: ELEV, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${stage.pct}%`, height: '100%', background: EMBER,
                  borderRadius: 2, transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Product List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayProducts.map((p: any, i: number) => {
            const statusColor = p.status === 'APPROVED' ? EMBER : p.status === 'PENDING' ? MUTED : DIM;
            const statusLabel = p.status === 'APPROVED' ? 'Ativo' : p.status === 'PENDING' ? 'Pendente' : 'Rascunho';
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: SURF, border: `1px solid ${BRD}`, borderRadius: 6,
                animation: `fadeIn 0.3s ease ${i * 0.06}s both`,
              }}>
                <span style={{ color: EMBER }}>{IC.package(20)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER }}>{p.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: DIM, marginTop: 2 }}>{p.format} &middot; {fmtBRL(p.price)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: SILVER }}>{fmtBRL(p.revenue)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>{statusLabel}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Feed */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            Feed ao Vivo
          </div>
          <LiveFeed
            color={EMBER}
            events={[
              { text: 'Nova venda: Curso Marketing Digital Pro', time: '2min' },
              { text: 'Afiliado gerou comissao de R$ 149.10', time: '8min' },
              { text: 'E-book Funil de Vendas atingiu 900 vendas', time: '15min' },
              { text: 'Checkout abandonado recuperado via email', time: '22min' },
            ]}
          />
        </div>
      </div>
    );
  };

  // ═════════════════════════════════
  // TAB: Area de Membros
  // ═════════════════════════════════
  const AreaMembros = () => (
    <div style={{ animation: 'slideIn 0.4s ease' }}>
      {/* Students Hero — 80px purple glow */}
      <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 200, height: 80, borderRadius: '50%',
          background: `radial-gradient(ellipse, ${PURPLE}40, transparent 70%)`,
          animation: 'glow 3s ease-in-out infinite', pointerEvents: 'none',
        }} />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>
            Total de Alunos
          </div>
          <div style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, color: SILVER, letterSpacing: '-0.02em' }}>
            {totalStudents.toLocaleString('pt-BR')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
            <NP color={PURPLE} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: PURPLE }}>+24 esta semana</span>
          </div>
        </div>
      </div>

      {/* Engagement Pulse */}
      <Ticker
        items={displayAreas.map((a: any) => `${a.name}: ${a.students} alunos`)}
        color={PURPLE}
      />

      {/* Areas Fibers — stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '20px 0' }}>
        {[
          { icon: IC.students, label: 'Alunos', value: String(totalStudents), sub: '+24 semana' },
          { icon: IC.chart, label: 'Conclusao', value: `${avgCompletion}%`, sub: 'media geral' },
          { icon: IC.book, label: 'Areas', value: String(displayAreas.length), sub: 'ativas' },
        ].map((s, i) => (
          <div key={i} style={{
            background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 16,
            animation: `fadeIn 0.3s ease ${i * 0.1}s both`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: PURPLE }}>{s.icon(18)}</span>
              <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: SILVER }}>{s.value}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: PURPLE, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Completion bars per area */}
      <div style={{ background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER, marginBottom: 16 }}>Progresso por Area</div>
        {displayAreas.filter((a: any) => a.completion > 0).map((a: any, i: number) => (
          <div key={a.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: SORA, fontSize: 12, color: SILVER }}>{a.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: PURPLE }}>{a.completion}%</span>
            </div>
            <div style={{ height: 4, background: ELEV, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${a.completion}%`, height: '100%',
                background: `linear-gradient(to right, ${PURPLE}50, ${PURPLE})`,
                borderRadius: 2, transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Certificates section */}
      <div style={{
        background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 20, marginBottom: 16,
        borderLeft: `3px solid ${PURPLE}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: PURPLE }}>{IC.certificate(18)}</span>
          <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER }}>Certificados Emitidos</span>
          <NP color={PURPLE} size={6} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Total emitidos', value: '847' },
            { label: 'Este mes', value: '62' },
            { label: 'Taxa de conclusao', value: '54%' },
            { label: 'Tempo medio', value: '34 dias' },
          ].map((c, i) => (
            <div key={i} style={{ padding: '10px 14px', background: ELEV, borderRadius: 6 }}>
              <div style={{ fontFamily: SORA, fontSize: 10, color: MUTED, marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: SILVER }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Areas list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayAreas.map((a: any, i: number) => (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
            background: SURF, border: `1px solid ${BRD}`, borderRadius: 6,
            animation: `fadeIn 0.3s ease ${i * 0.06}s both`,
          }}>
            <span style={{ color: PURPLE }}>{IC.community(20)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER }}>{a.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: DIM, marginTop: 2 }}>{a.type} &middot; {a.modules} modulos</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: SILVER }}>{a.students} alunos</div>
              {a.completion > 0 && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: PURPLE, marginTop: 2 }}>{a.completion}% conclusao</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Live Feed */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          Atividade Recente
        </div>
        <LiveFeed
          color={PURPLE}
          events={[
            { text: 'Maria S. concluiu modulo 7 de Marketing', time: '5min' },
            { text: 'Novo aluno em Formacao Dev Full Stack', time: '12min' },
            { text: 'Certificado emitido para Joao P.', time: '18min' },
            { text: '3 alunos completaram quiz do modulo 4', time: '25min' },
          ]}
        />
      </div>
    </div>
  );

  // ═════════════════════════════════
  // TAB: Afiliar-se
  // ═════════════════════════════════
  const AfiliarSe = () => {
    const filteredMarket = MARKETPLACE.filter(m =>
      !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase())
    );

    // Detail view for a selected marketplace item
    if (selectedMarketItem) {
      const item = selectedMarketItem;
      return (
        <div style={{ animation: 'slideIn 0.3s ease' }}>
          {/* Back button */}
          <button
            onClick={() => setSelectedMarketItem(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', color: GREEN,
              fontFamily: SORA, fontSize: 13, cursor: 'pointer',
              padding: 0, marginBottom: 20,
            }}
          >
            {IC.arrowLeft(14)} Voltar ao marketplace
          </button>

          {/* Item Header */}
          <div style={{ background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 24, marginBottom: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 20, fontWeight: 700, color: SILVER }}>{item.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED, marginTop: 4 }}>por {item.producer} &middot; {item.category}</div>
            <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
              {[
                { label: 'Preco', value: fmtBRL(item.price) },
                { label: 'Comissao', value: `${item.commission}%` },
                { label: 'Vendas', value: fmt(item.sales) },
                { label: 'Avaliacao', value: `${item.rating}/5` },
              ].map((d, i) => (
                <div key={i}>
                  <div style={{ fontFamily: SORA, fontSize: 10, color: MUTED, textTransform: 'uppercase' as const }}>{d.label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: SILVER, marginTop: 2 }}>{d.value}</div>
                </div>
              ))}
            </div>
            <button style={{
              marginTop: 16, padding: '10px 24px', background: GREEN,
              color: '#fff', border: 'none', borderRadius: 6,
              fontFamily: SORA, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Solicitar Afiliacao
            </button>
          </div>

          {/* AI Analysis */}
          <div style={{
            background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 20,
            borderLeft: `3px solid ${GREEN}`, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ color: GREEN }}>{IC.ai(16)}</span>
              <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER }}>Analise IA</span>
              <NP color={GREEN} size={6} />
            </div>
            <div style={{ fontFamily: SORA, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              Este produto tem alta taxa de conversao ({item.rating}/5) e comissao de {item.commission}%.
              Com base no seu publico, estimamos ganhos de {fmtBRL(item.price * item.commission / 100 * 15)} nos primeiros 30 dias.
              Recomendacao: usar trafego organico no Instagram com copy focada em transformacao.
            </div>
          </div>

          {/* Performance chart placeholder */}
          <div style={{ background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 20 }}>
            <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER, marginBottom: 16 }}>Historico de Performance</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
              {[32, 18, 45, 28, 52, 38, 22, 48, 35, 60, 42, 55, 30, 65, 40, 50, 25, 58, 45, 70, 35, 62, 48, 55, 30, 68, 42, 75, 50, 80].map((v, i) => (
                <div key={i} style={{
                  flex: 1, height: v, borderRadius: '2px 2px 0 0',
                  background: `linear-gradient(to top, ${GREEN}30, ${GREEN})`,
                  animation: `fadeIn 0.3s ease ${i * 0.02}s both`,
                }} />
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ animation: 'slideIn 0.4s ease' }}>
        {/* Earnings Hero — 80px green glow */}
        <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 200, height: 80, borderRadius: '50%',
            background: `radial-gradient(ellipse, ${GREEN}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>
              Ganhos Totais
            </div>
            <div style={{ fontFamily: MONO, fontSize: 42, fontWeight: 700, color: SILVER, letterSpacing: '-0.02em' }}>
              {fmtBRL(totalEarnings)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
              <NP color={GREEN} />
              <span style={{ fontFamily: MONO, fontSize: 12, color: GREEN }}>+R$ 2.340 esta semana</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }}>
            {IC.search(16)}
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produtos para se afiliar..."
            style={{
              width: '100%', padding: '10px 14px 10px 36px',
              background: SURF, border: `1px solid ${BRD}`, borderRadius: 6,
              color: SILVER, fontFamily: SORA, fontSize: 13, outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>

        {/* Marketplace Fibers — stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { icon: IC.revenue, label: 'Ganhos', value: fmtBRL(totalEarnings), sub: '+R$ 2.340' },
            { icon: IC.chart, label: 'Conversao', value: '4.2%', sub: '+0.3% semana' },
            { icon: IC.heartFill, label: 'Afiliados', value: '4', sub: 'produtos ativos' },
          ].map((s, i) => (
            <div key={i} style={{
              background: SURF, border: `1px solid ${BRD}`, borderRadius: 6, padding: 16,
              animation: `fadeIn 0.3s ease ${i * 0.1}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ color: GREEN }}>{s.icon(18)}</span>
                <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: SILVER }}>{s.value}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: GREEN, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Marketplace grid */}
        <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          Marketplace ({filteredMarket.length} produtos)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredMarket.map((m, i) => (
            <div
              key={m.id}
              onClick={() => setSelectedMarketItem(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: SURF, border: `1px solid ${BRD}`, borderRadius: 6,
                cursor: 'pointer', animation: `fadeIn 0.3s ease ${i * 0.06}s both`,
                transition: 'border-color 150ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = GLOW)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = BRD)}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 6, background: ELEV,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: GREEN }}>{IC.package(20)}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: SILVER }}>{m.name}</span>
                  {m.temperature >= 90 && <span style={{ color: EMBER }}>{IC.fire(12)}</span>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: DIM, marginTop: 2 }}>
                  {m.category} &middot; por {m.producer}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: GREEN }}>{m.commission}%</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, marginTop: 2 }}>{fmtBRL(m.price)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: EMBER }}>{IC.star(12)}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{m.rating}</span>
              </div>
              <span style={{ color: DIM }}>{IC.chevRight(14)}</span>
            </div>
          ))}
        </div>

        {/* Live Feed */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            Vendas Recentes
          </div>
          <LiveFeed
            color={GREEN}
            events={[
              { text: 'Comissao recebida: R$ 148.50 — Metodo Emagrecer', time: '3min' },
              { text: 'Novo clique no link: Formula Negocio Online', time: '11min' },
              { text: 'Venda confirmada: Curso Instagram Pro', time: '19min' },
              { text: 'Pagamento de comissao processado: R$ 98.50', time: '32min' },
            ]}
          />
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: VOID, color: SILVER, fontFamily: SORA }}>
      <style>{ANIMATIONS}</style>

      {/* Page container */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: SORA, fontSize: 22, fontWeight: 700, color: SILVER, letterSpacing: '-0.02em' }}>
            Produtos
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED, marginTop: 4 }}>
            Gerencie, analise e monetize seus produtos digitais
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 0, marginBottom: 28,
          borderBottom: `1px solid ${BRD}`,
        }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={{
                  padding: '12px 24px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
                  color: isActive ? tab.color : MUTED,
                  fontFamily: SORA,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  position: 'relative',
                }}
              >
                {isActive && (
                  <span style={{
                    position: 'absolute', bottom: -1, left: '50%', transform: 'translateX(-50%)',
                    width: 40, height: 2, background: tab.color,
                    filter: `blur(4px)`, opacity: 0.6,
                  }} />
                )}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'produtos' && <MeusProdutos />}
        {activeTab === 'membros' && <AreaMembros />}
        {activeTab === 'afiliar' && <AfiliarSe />}
      </div>
    </div>
  );
}
