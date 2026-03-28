'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProducts } from '@/hooks/useProducts';
import { useMemberAreas } from '@/hooks/useMemberAreas';

// ── Fonts ──
const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── Icons (IC) — 12 icons ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  box:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  users:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  store:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  zap:    (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  plus:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  fire:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="#E85D30" stroke="none"><path d="M12 23c-4.97 0-8-3.58-8-7.5 0-3.07 1.74-5.44 3.28-7.17.56-.63 1.12-1.2 1.58-1.73.32-.37.6-.72.82-1.08C10.37 4.4 10.73 3 11.2 1.5c.12-.38.62-.42.8-.07.68 1.31 1.56 3.15 2.2 4.85.31.83.56 1.62.7 2.32.07.35.36.63.72.67.36.04.7-.16.85-.48.24-.52.44-1.09.6-1.69.1-.38.56-.5.78-.17C19.5 9.62 20 12.09 20 15.5 20 19.42 16.97 23 12 23Z"/></svg>,
  star:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  book:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  play:   (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  search: (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  heart:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="#E85D30" stroke="#E85D30" strokeWidth={2}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  trend:  (s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth={2}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
};

// ── Products (5 items with id/name/price/sales/revenue/students/category/status/color) ──
const PRODUCTS = [
  { id: 'p1', name: 'Curso IA Marketing', price: 497, sales: 234, revenue: 116298, students: 234, category: 'Curso', status: 'active', color: '#8B5CF6' },
  { id: 'p2', name: 'eBook Funil de Vendas', price: 47, sales: 892, revenue: 41924, students: 892, category: 'eBook', status: 'active', color: '#E85D30' },
  { id: 'p3', name: 'Mentoria Premium 1-1', price: 2997, sales: 12, revenue: 35964, students: 12, category: 'Mentoria', status: 'active', color: '#22C55E' },
  { id: 'p4', name: 'Kit Planilhas Financeiras', price: 37, sales: 156, revenue: 5772, students: 156, category: 'Digital', status: 'pending', color: '#F59E0B' },
  { id: 'p5', name: 'Comunidade Empreendedores', price: 97, sales: 89, revenue: 8633, students: 89, category: 'Comunidade', status: 'draft', color: '#6366F1' },
];

// ── Areas (3 items) ──
const AREAS = [
  { id: 'a1', name: 'Academia de Marketing', type: 'COURSE', students: 234, modules: 12, completion: 68, status: 'active' },
  { id: 'a2', name: 'Clube de Empreendedores', type: 'COMMUNITY', students: 187, modules: 0, completion: 0, status: 'active' },
  { id: 'a3', name: 'Formacao Dev Full Stack', type: 'HYBRID', students: 89, modules: 24, completion: 45, status: 'active' },
];

// ── Marketplace (5 items) ──
const MARKETPLACE = [
  { id: 'm1', name: 'Metodo Emagrecer de Vez', category: 'Saude', commission: 48, price: 297, rating: 4.8, sales: 12400, temperature: 95, producer: 'Dr. Carlos Lima', description: 'Programa completo de emagrecimento saudavel com acompanhamento nutricional e treinos personalizados. Mais de 12.000 alunos transformados.', materials: ['Banner 728x90', 'Banner 300x250', 'Copy para Email', 'Video de Vendas', 'Swipe Files'], affiliateLink: 'kloel.com/ref/m1' },
  { id: 'm2', name: 'Formula Negocio Online', category: 'Negocios', commission: 60, price: 497, rating: 4.9, sales: 45200, temperature: 98, producer: 'Alex Vargas', description: 'O treinamento mais completo do Brasil para criar seu negocio online do zero. Inclui trafego pago, organico e funis de vendas.', materials: ['Kit Completo Banners', 'Email Sequence (7 dias)', 'Landing Page', 'Video Depoimentos'], affiliateLink: 'kloel.com/ref/m2' },
  { id: 'm3', name: 'Curso Instagram Pro', category: 'Marketing', commission: 40, price: 197, rating: 4.6, sales: 8900, temperature: 82, producer: 'Camila Digital', description: 'Domine o Instagram e transforme seguidores em clientes. Estrategias organicas e pagas para crescer no Instagram.', materials: ['Banners Stories', 'Copy Templates', 'Hashtag Guide'], affiliateLink: 'kloel.com/ref/m3' },
  { id: 'm4', name: 'Trader Profissional', category: 'Financas', commission: 55, price: 997, rating: 4.7, sales: 3200, temperature: 88, producer: 'Lucas Trade', description: 'Aprenda a operar no mercado financeiro como um profissional. Day trade, swing trade e investimentos de longo prazo.', materials: ['Banners Web', 'Email Sequence', 'Webinar Replay'], affiliateLink: 'kloel.com/ref/m4' },
  { id: 'm5', name: 'Ingles em 90 Dias', category: 'Educacao', commission: 35, price: 397, rating: 4.4, sales: 15800, temperature: 91, producer: 'Teacher Mike', description: 'Metodo imersivo para aprender ingles fluente em 90 dias. Aulas ao vivo, material didatico e comunidade de pratica.', materials: ['Banner Pack', 'Landing Page Clone', 'Email Copy'], affiliateLink: 'kloel.com/ref/m5' },
];

// ── NeuralPulse (NP) — animated pulse dot ──
function NP({ color = '#E85D30', size = 8 }: { color?: string; size?: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, animation: 'pulse 2s ease-in-out infinite' }} />
      <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: color, opacity: 0.3, animation: 'pulse 2s ease-in-out infinite 0.3s' }} />
    </span>
  );
}

// ── Ticker — scrolling horizontal text ──
function Ticker({ items, color = '#E85D30', duration = '30s' }: { items: string[]; color?: string; duration?: string }) {
  const text = items.join('  ///  ');
  return (
    <div style={{ overflow: 'hidden', width: '100%', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '6px 0' }}>
      <div style={{ display: 'inline-block', whiteSpace: 'nowrap', animation: `tickerScroll ${duration} linear infinite`, fontFamily: MONO, fontSize: 11, color, opacity: 0.7 }}>
        {text}&nbsp;&nbsp;&nbsp;///&nbsp;&nbsp;&nbsp;{text}
      </div>
    </div>
  );
}

// ── LiveFeed — small event list ──
function LiveFeed({ events, color = '#E85D30' }: { events: { text: string; time: string }[]; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', animation: `fadeIn 0.3s ease ${i * 0.1}s both` }}>
          <NP color={color} size={6} />
          <span style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8', flex: 1 }}>{ev.text}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F' }}>{ev.time}</span>
        </div>
      ))}
    </div>
  );
}

// ── CSS Animations ──
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

// ── Tab Config ──
const TABS = [
  { key: 'produtos', label: 'Meus Produtos', color: '#E85D30', route: '/products' },
  { key: 'membros',  label: 'Area de Membros', color: '#8B5CF6', route: '/produtos/area-membros' },
  { key: 'afiliar',  label: 'Afiliar-se', color: '#10B981', route: '/produtos/afiliar-se' },
];

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════
export default function ProdutosView({ defaultTab = 'produtos' }: { defaultTab?: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [rev, setRev] = useState(97604);
  const [students, setStudents] = useState(510);
  const [earnings, setEarnings] = useState(14634);
  const [search, setSearch] = useState('');
  const [selectedMarketItem, setSelectedMarketItem] = useState<any>(null);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const revRef = useRef(rev);
  revRef.current = rev;

  // ── Real data hooks (mock fallback) ──
  const { products: realProducts } = useProducts();
  const { areas: realAreas } = useMemberAreas();

  const displayProducts = (realProducts && (realProducts as any[]).length > 0)
    ? (realProducts as any[]).map((p: any) => ({
        id: p.id, name: p.name, price: p.price || 0, sales: p.totalSales || p.sales || 0,
        revenue: p.totalRevenue || p.revenue || 0, students: p.studentsCount || p.students || 0,
        category: p.category || 'Digital', status: p.active !== false ? 'active' : 'draft',
        color: '#8B5CF6',
      }))
    : PRODUCTS;

  const displayAreas = (realAreas && (realAreas as any[]).length > 0)
    ? (realAreas as any[]).map((a: any) => ({
        id: a.id, name: a.name, type: a.type || 'COURSE',
        students: a.studentsCount || a.students || 0,
        modules: a.modulesCount || a.modules || 0,
        completion: a.avgCompletion || a.completion || 0,
        status: a.status || 'active',
      }))
    : AREAS;

  // Revenue interval 4000ms
  useEffect(() => {
    const iv = setInterval(() => {
      const bump = Math.floor(Math.random() * 300) + 50;
      setRev(p => p + bump);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key);
    setSelectedMarketItem(null);
    const tab = TABS.find(t => t.key === key);
    if (tab) router.push(tab.route);
  }, [router]);

  // ── Formatters ──
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const fmtBRL = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  // ── Derived stats ──
  const totalRevenue = displayProducts.reduce((s: number, p: any) => s + (p.revenue || 0), 0);
  const totalSales = displayProducts.reduce((s: number, p: any) => s + (p.sales || 0), 0);
  const activeProducts = displayProducts.filter((p: any) => p.status === 'active').length;
  const totalStudents = displayAreas.reduce((s: number, a: any) => s + (a.students || 0), 0) || students;
  const areasWithCompletion = displayAreas.filter((a: any) => a.completion > 0);
  const avgCompletion = areasWithCompletion.length > 0 ? Math.round(areasWithCompletion.reduce((s: number, a: any) => s + a.completion, 0) / areasWithCompletion.length) : 0;

  // ═════════════════════════════════
  // TAB: Meus Produtos (ember)
  // ═════════════════════════════════
  const MeusProdutos = () => {
    const EMBER = '#E85D30';
    const revenueBars = [65, 80, 45, 90, 55, 72, 88];
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

    return (
      <div style={{ animation: 'slideIn 0.4s ease' }}>
        {/* Revenue Hero -- 80px glow */}
        <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 200, height: 80, borderRadius: '50%',
            background: `radial-gradient(ellipse, ${EMBER}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>
              Receita Total
            </div>
            <div style={{ fontFamily: MONO, fontSize: 80, fontWeight: 700, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
              {fmtBRL(totalRevenue + rev - 97604)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
              <NP color={EMBER} />
              <span style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>+18.4% vs mes anterior</span>
            </div>
          </div>
        </div>

        {/* Ticker 22s */}
        <Ticker
          items={displayProducts.map((p: any) => `${p.name}: ${fmt(p.sales)} vendas`)}
          color={EMBER}
          duration="22s"
        />

        {/* Nerve Fibers -- stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '20px 0' }}>
          {[
            { icon: IC.box, label: 'Receita', value: fmtBRL(totalRevenue), sub: '+18.4%' },
            { icon: IC.store, label: 'Vendas', value: String(totalSales), sub: '+12 hoje' },
            { icon: IC.zap, label: 'Ativos', value: String(activeProducts), sub: `de ${displayProducts.length}` },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 16,
              animation: `fadeIn 0.3s ease ${i * 0.1}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ color: EMBER }}>{s.icon(18)}</span>
                <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: '#6E6E73', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: '#E0DDD8' }}>{s.value}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: EMBER, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Revenue Bars */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8', marginBottom: 16 }}>Receita Semanal</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {revenueBars.map((v, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: v, background: `linear-gradient(to top, ${EMBER}30, ${EMBER})`,
                  borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease',
                  animation: `fadeIn 0.4s ease ${i * 0.08}s both`,
                }} />
                <div style={{ fontFamily: MONO, fontSize: 9, color: '#3A3A3F', marginTop: 4 }}>{days[i]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Motor IA */}
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, marginBottom: 16,
          borderLeft: `3px solid ${EMBER}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: EMBER }}>{IC.zap(16)}</span>
            <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>Motor IA</span>
            <NP color={EMBER} size={6} />
          </div>
          <div style={{ fontFamily: SORA, fontSize: 12, color: '#6E6E73', lineHeight: 1.6 }}>
            Seu produto &quot;Curso IA Marketing&quot; tem potencial de +32% em conversao.
            Sugestao: adicionar depoimentos na pagina de vendas e criar um funil de email com 5 mensagens.
          </div>
        </div>

        {/* Funil */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ color: EMBER }}>{IC.trend(16)}</span>
            <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>Funil de Vendas</span>
          </div>
          {[
            { label: 'Visitantes', value: 12480, pct: 100 },
            { label: 'Checkout', value: 3120, pct: 25 },
            { label: 'Pagamento', value: 1560, pct: 12.5 },
            { label: 'Aprovado', value: 1294, pct: 10.4 },
          ].map((stage, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 11, color: '#6E6E73' }}>{stage.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: '#E0DDD8' }}>{fmt(stage.value)} ({stage.pct}%)</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${stage.pct}%`, height: '100%', background: EMBER, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Product List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayProducts.map((p: any, i: number) => {
            const statusColor = p.status === 'active' ? EMBER : p.status === 'pending' ? '#6E6E73' : '#3A3A3F';
            const statusLabel = p.status === 'active' ? 'Ativo' : p.status === 'pending' ? 'Pendente' : 'Rascunho';
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
                animation: `fadeIn 0.3s ease ${i * 0.06}s both`,
              }}>
                <span style={{ color: p.color || EMBER }}>{IC.box(20)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>{p.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: '#3A3A3F', marginTop: 2 }}>{p.category} &middot; {fmtBRL(p.price)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>{fmtBRL(p.revenue)}</div>
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
          <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: '#6E6E73', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            Feed ao Vivo
          </div>
          <LiveFeed
            color={EMBER}
            events={[
              { text: 'Nova venda: Curso IA Marketing', time: '2min' },
              { text: 'Afiliado gerou comissao de R$ 149.10', time: '8min' },
              { text: 'eBook Funil de Vendas atingiu 900 vendas', time: '15min' },
              { text: 'Checkout abandonado recuperado via email', time: '22min' },
            ]}
          />
        </div>
      </div>
    );
  };

  // ═════════════════════════════════
  // TAB: Area de Membros (purple #8B5CF6)
  // ═════════════════════════════════
  const AreaMembros = () => {
    const PURPLE = '#8B5CF6';

    return (
      <div style={{ animation: 'slideIn 0.4s ease' }}>
        {/* Students Hero -- 80px purple glow */}
        <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 200, height: 80, borderRadius: '50%',
            background: `radial-gradient(ellipse, ${PURPLE}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>
              Total de Alunos
            </div>
            <div style={{ fontFamily: MONO, fontSize: 80, fontWeight: 700, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
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

        {/* Areas Fibers -- stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '20px 0' }}>
          {[
            { icon: IC.users, label: 'Alunos', value: String(totalStudents), sub: '+24 semana' },
            { icon: IC.trend, label: 'Conclusao', value: `${avgCompletion}%`, sub: 'media geral' },
            { icon: IC.book, label: 'Areas', value: String(displayAreas.length), sub: 'ativas' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 16,
              animation: `fadeIn 0.3s ease ${i * 0.1}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ color: PURPLE }}>{s.icon(18)}</span>
                <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: '#6E6E73', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: '#E0DDD8' }}>{s.value}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: PURPLE, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Completion bars per area */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8', marginBottom: 16 }}>Progresso por Area</div>
          {displayAreas.filter((a: any) => a.completion > 0).map((a: any) => (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8' }}>{a.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: PURPLE }}>{a.completion}%</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${a.completion}%`, height: '100%',
                  background: `linear-gradient(to right, ${PURPLE}50, ${PURPLE})`,
                  borderRadius: 2, transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Certificates */}
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, marginBottom: 16,
          borderLeft: `3px solid ${PURPLE}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: PURPLE }}>{IC.star(18)}</span>
            <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>Certificados Emitidos</span>
            <NP color={PURPLE} size={6} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Total emitidos', value: '847' },
              { label: 'Este mes', value: '62' },
              { label: 'Taxa de conclusao', value: '54%' },
              { label: 'Tempo medio', value: '34 dias' },
            ].map((c, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                <div style={{ fontFamily: SORA, fontSize: 10, color: '#6E6E73', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: '#E0DDD8' }}>{c.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Areas list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayAreas.map((a: any, i: number) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
              animation: `fadeIn 0.3s ease ${i * 0.06}s both`,
            }}>
              <span style={{ color: PURPLE }}>{IC.users(20)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>{a.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: '#3A3A3F', marginTop: 2 }}>{a.type} &middot; {a.modules} modulos</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>{a.students} alunos</div>
                {a.completion > 0 && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: PURPLE, marginTop: 2 }}>{a.completion}% conclusao</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Live Feed */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: '#6E6E73', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
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
  };

  // ═════════════════════════════════
  // TAB: Afiliar-se (green #10B981)
  // ═════════════════════════════════
  const AfiliarSe = () => {
    const GREEN = '#10B981';

    const categories = [...new Set(MARKETPLACE.map(m => m.category))];
    const filteredMarket = MARKETPLACE.filter(m => {
      const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase());
      const matchCat = !catFilter || m.category === catFilter;
      return matchSearch && matchCat;
    });

    // ── DETAIL VIEW ──
    if (selectedMarketItem) {
      const item = selectedMarketItem;
      const commissionPerSale = item.price * item.commission / 100;
      const projected30 = commissionPerSale * 15;
      const projected90 = commissionPerSale * 50;

      return (
        <div style={{ animation: 'slideIn 0.3s ease' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <button
              onClick={() => setSelectedMarketItem(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: GREEN, fontFamily: SORA, fontSize: 13, cursor: 'pointer', padding: 0 }}
            >
              &larr; Marketplace
            </button>
            <span style={{ color: '#3A3A3F' }}>/</span>
            <span style={{ fontFamily: SORA, fontSize: 13, color: '#E0DDD8' }}>{item.name}</span>
          </div>

          {/* Commission Hero 48% */}
          <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: 200, height: 80, borderRadius: '50%',
              background: `radial-gradient(ellipse, ${GREEN}40, transparent 70%)`,
              animation: 'glow 3s ease-in-out infinite', pointerEvents: 'none',
            }} />
            <div style={{ textAlign: 'center', position: 'relative' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>
                Comissao
              </div>
              <div style={{ fontFamily: MONO, fontSize: 80, fontWeight: 700, color: GREEN, letterSpacing: '-0.02em' }}>
                {item.commission}%
              </div>
              <div style={{ fontFamily: MONO, fontSize: 14, color: '#E0DDD8', marginTop: 4 }}>
                {fmtBRL(commissionPerSale)} por venda
              </div>
            </div>
          </div>

          {/* Item Header */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 24, marginBottom: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 20, fontWeight: 700, color: '#E0DDD8' }}>{item.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: '#6E6E73', marginTop: 4 }}>por {item.producer} &middot; {item.category}</div>
            <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
              {[
                { label: 'Preco', value: fmtBRL(item.price) },
                { label: 'Comissao', value: `${item.commission}%` },
                { label: 'Vendas', value: fmt(item.sales) },
                { label: 'Avaliacao', value: `${item.rating}/5` },
                { label: 'Temperatura', value: `${item.temperature}` },
              ].map((d, i) => (
                <div key={i}>
                  <div style={{ fontFamily: SORA, fontSize: 10, color: '#6E6E73', textTransform: 'uppercase' as const }}>{d.label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: '#E0DDD8', marginTop: 2 }}>{d.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, marginBottom: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8', marginBottom: 8 }}>Descricao</div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: '#6E6E73', lineHeight: 1.7 }}>{item.description}</div>
          </div>

          {/* Projections */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, borderLeft: `3px solid ${GREEN}` }}>
              <div style={{ fontFamily: SORA, fontSize: 10, color: '#6E6E73', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Projecao 30 dias</div>
              <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: GREEN, marginTop: 8 }}>{fmtBRL(projected30)}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73', marginTop: 4 }}>~15 vendas estimadas</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, borderLeft: `3px solid ${GREEN}` }}>
              <div style={{ fontFamily: SORA, fontSize: 10, color: '#6E6E73', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Projecao 90 dias</div>
              <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: GREEN, marginTop: 8 }}>{fmtBRL(projected90)}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73', marginTop: 4 }}>~50 vendas estimadas</div>
            </div>
          </div>

          {/* Materials */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, marginBottom: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8', marginBottom: 12 }}>Materiais de Divulgacao</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {item.materials.map((mat: string, i: number) => (
                <span key={i} style={{
                  fontFamily: MONO, fontSize: 11, padding: '6px 12px',
                  background: `${GREEN}15`, color: GREEN, borderRadius: 6,
                  border: `1px solid ${GREEN}30`,
                }}>{mat}</span>
              ))}
            </div>
          </div>

          {/* Affiliate Links */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20, marginBottom: 16 }}>
            <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8', marginBottom: 12 }}>Seu Link de Afiliado</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{
                flex: 1, fontFamily: MONO, fontSize: 13, color: GREEN,
                padding: '10px 14px', background: `${GREEN}10`,
                borderRadius: 6, border: `1px solid ${GREEN}30`,
              }}>
                {item.affiliateLink}
              </div>
              <button style={{
                padding: '10px 16px', background: GREEN, color: '#fff',
                border: 'none', borderRadius: 6, fontFamily: SORA,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Copiar</button>
            </div>
          </div>

          {/* AI Analysis */}
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20,
            borderLeft: `3px solid ${GREEN}`, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ color: GREEN }}>{IC.zap(16)}</span>
              <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>Analise IA</span>
              <NP color={GREEN} size={6} />
            </div>
            <div style={{ fontFamily: SORA, fontSize: 12, color: '#6E6E73', lineHeight: 1.6 }}>
              Este produto tem alta taxa de conversao ({item.rating}/5) e comissao de {item.commission}%.
              Com base no seu publico, estimamos ganhos de {fmtBRL(projected30)} nos primeiros 30 dias.
              Recomendacao: usar trafego organico no Instagram com copy focada em transformacao.
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <button style={{
              padding: '14px 40px', background: GREEN, color: '#fff',
              border: 'none', borderRadius: 8, fontFamily: SORA,
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              boxShadow: `0 0 30px ${GREEN}40`,
            }}>
              Solicitar Afiliacao
            </button>
          </div>

          {/* Gains chart */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 20 }}>
            <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8', marginBottom: 16 }}>Historico de Performance</div>
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

    // ── MAIN AFILIAR-SE VIEW ──
    return (
      <div style={{ animation: 'slideIn 0.4s ease' }}>
        {/* Earnings Hero -- 80px green glow */}
        <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 200, height: 80, borderRadius: '50%',
            background: `radial-gradient(ellipse, ${GREEN}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>
              Ganhos Totais
            </div>
            <div style={{ fontFamily: MONO, fontSize: 80, fontWeight: 700, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
              {fmtBRL(earnings)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
              <NP color={GREEN} />
              <span style={{ fontFamily: MONO, fontSize: 12, color: GREEN }}>+R$ 2.340 esta semana</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6E6E73' }}>
            {IC.search(16)}
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produtos para se afiliar..."
            style={{
              width: '100%', padding: '10px 14px 10px 36px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
              color: '#E0DDD8', fontFamily: SORA, fontSize: 13, outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>

        {/* Category Chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => setCatFilter(null)}
            style={{
              padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontFamily: SORA, fontSize: 11, fontWeight: 600,
              background: !catFilter ? GREEN : 'rgba(255,255,255,0.05)',
              color: !catFilter ? '#fff' : '#6E6E73',
            }}
          >Todos</button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? null : cat)}
              style={{
                padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontFamily: SORA, fontSize: 11, fontWeight: 600,
                background: catFilter === cat ? GREEN : 'rgba(255,255,255,0.05)',
                color: catFilter === cat ? '#fff' : '#6E6E73',
              }}
            >{cat}</button>
          ))}
        </div>

        {/* Marketplace Fibers -- stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { icon: IC.box, label: 'Ganhos', value: fmtBRL(earnings), sub: '+R$ 2.340' },
            { icon: IC.trend, label: 'Conversao', value: '4.2%', sub: '+0.3% semana' },
            { icon: IC.heart, label: 'Afiliados', value: '4', sub: 'produtos ativos' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: 16,
              animation: `fadeIn 0.3s ease ${i * 0.1}s both`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ color: GREEN }}>{s.icon(18)}</span>
                <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: '#6E6E73', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{s.label}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: '#E0DDD8' }}>{s.value}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: GREEN, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Marketplace grid */}
        <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: '#6E6E73', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          Marketplace ({filteredMarket.length} produtos)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredMarket.map((m, i) => (
            <div
              key={m.id}
              onClick={() => setSelectedMarketItem(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
                cursor: 'pointer', animation: `fadeIn 0.3s ease ${i * 0.06}s both`,
                transition: 'border-color 150ms ease',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: GREEN }}>{IC.box(20)}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>{m.name}</span>
                  {m.temperature >= 90 && <span>{IC.fire(12)}</span>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: '#3A3A3F', marginTop: 2 }}>
                  {m.category} &middot; por {m.producer}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: GREEN }}>{m.commission}%</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73', marginTop: 2 }}>{fmtBRL(m.price)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#E85D30' }}>{IC.star(12)}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73' }}>{m.rating}</span>
              </div>
              <span style={{ color: '#3A3A3F', fontFamily: SORA, fontSize: 16 }}>&rsaquo;</span>
            </div>
          ))}
        </div>

        {/* Live Feed */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: '#6E6E73', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
            Vendas Recentes
          </div>
          <LiveFeed
            color={GREEN}
            events={[
              { text: 'Comissao recebida: R$ 148.50 \u2014 Metodo Emagrecer', time: '3min' },
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
    <div style={{ minHeight: '100vh', background: '#0A0A0C', color: '#E0DDD8', fontFamily: SORA }}>
      <style>{ANIMATIONS}</style>

      {/* Page container */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: SORA, fontSize: 22, fontWeight: 700, color: '#E0DDD8', letterSpacing: '-0.02em' }}>
            Produtos
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: '#6E6E73', marginTop: 4 }}>
            Gerencie, analise e monetize seus produtos digitais
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 0, marginBottom: 28,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
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
                  color: isActive ? tab.color : '#6E6E73',
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
