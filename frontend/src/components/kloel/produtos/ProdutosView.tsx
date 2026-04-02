'use client';

import React, { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useProducts, useProductMutations } from '@/hooks/useProducts';
import { useMemberAreas, useMemberAreaMutations } from '@/hooks/useMemberAreas';
import { apiFetch } from '@/lib/api';
import { mutate } from 'swr';
import { affiliateApi } from '@/lib/api/misc';

// ── Fonts ──
const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── DNA Colors ──
const BG_CARD = '#111113';
const BG_ELEVATED = '#19191C';
const BORDER = '#222226';
const EMBER = '#E85D30';
const PURPLE = '#8B5CF6';
const GREEN = '#10B981';

// ── Icons (IC) ──
const IC: Record<string, (s: number) => React.ReactElement> = {
  box: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  users: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  store: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  zap: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  plus: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  fire: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#E85D30" stroke="none">
      <path d="M12 23c-4.97 0-8-3.58-8-7.5 0-3.07 1.74-5.44 3.28-7.17.56-.63 1.12-1.2 1.58-1.73.32-.37.6-.72.82-1.08C10.37 4.4 10.73 3 11.2 1.5c.12-.38.62-.42.8-.07.68 1.31 1.56 3.15 2.2 4.85.31.83.56 1.62.7 2.32.07.35.36.63.72.67.36.04.7-.16.85-.48.24-.52.44-1.09.6-1.69.1-.38.56-.5.78-.17C19.5 9.62 20 12.09 20 15.5 20 19.42 16.97 23 12 23Z" />
    </svg>
  ),
  star: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  book: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  play: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  search: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  heart: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="#E85D30" stroke="#E85D30" strokeWidth={2}>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  ),
  trend: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth={2}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  edit: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  trash: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  chevDown: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  chevRight: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
};

// ── NeuralPulse (NP) — canvas 2D with sin() waves ──
function NP({ w = 160, h = 28, color = '#E85D30' }: { w?: number; h?: number; color?: string }) {
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
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.15 + Math.sin(frame * 0.02 + i) * 0.1;
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 2) {
          const spike = Math.random() > 0.97 ? (Math.random() - 0.5) * h * 0.6 : 0;
          const y =
            h / 2 + Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (h * 0.25 + i * 2) + spike;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
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

// ── Ticker — scrolling horizontal text ──
function Ticker({
  items,
  color = '#E85D30',
  duration = '22s',
}: {
  items: string[];
  color?: string;
  duration?: string;
}) {
  const text = items.join('  ///  ');
  return (
    <div
      style={{
        overflow: 'hidden',
        width: '100%',
        background: BG_CARD,
        borderTop: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        padding: '6px 0',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          animation: `tickerScroll ${duration} linear infinite`,
          fontFamily: MONO,
          fontSize: 11,
          color,
          opacity: 0.7,
        }}
      >
        {text}&nbsp;&nbsp;&nbsp;///&nbsp;&nbsp;&nbsp;{text}
      </div>
    </div>
  );
}

// ── LiveFeed — small event list ──
function LiveFeed({
  events,
  color = '#E85D30',
}: {
  events: { text: string; time: string }[];
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((ev, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            opacity: 1,
          }}
        >
          <NP w={24} h={12} color={color} />
          <span style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8', flex: 1 }}>
            {ev.text}
          </span>
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
@keyframes glowText {
  0%, 100% { text-shadow: 0 0 20px rgba(232,93,48,0.3); }
  50% { text-shadow: 0 0 40px rgba(232,93,48,0.8), 0 0 80px rgba(232,93,48,0.4); }
}
`;

// ── Formatters ──
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const fmtBRL = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const timeAgo = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}min`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
  return `${Math.floor(diffMinutes / 1440)}d`;
};

// ── Style helpers ──
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: BG_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: '#E0DDD8',
  fontFamily: MONO,
  fontSize: 12,
  outline: 'none',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
const btnPrimary = (color: string): React.CSSProperties => ({
  padding: '8px 16px',
  background: color,
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontFamily: SORA,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
});
const btnGhost: React.CSSProperties = {
  padding: '8px 16px',
  background: 'none',
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: '#6E6E73',
  fontFamily: SORA,
  fontSize: 12,
  cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
};

// ── Tab Config ──
const TABS = [
  { key: 'produtos', label: 'Meus Produtos', color: EMBER, route: '/products' },
  { key: 'membros', label: 'Area de Membros', color: PURPLE, route: '/produtos/area-membros' },
  { key: 'afiliar', label: 'Afiliar-se', color: GREEN, route: '/produtos/afiliar-se' },
];

function isLegacyProductName(value: string | null | undefined) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();

  return normalized === 'ghkcu' || normalized === 'pdrn';
}

// ═════════════════════════════════
// TAB: Meus Produtos (ember)
// ═════════════════════════════════
function MeusProdutos({
  displayProducts,
  totalRevenue,
  totalSales,
  activeProducts,
  onDeleteProduct,
  onCreateProduct,
  onOpenFeature,
  requestedFeature,
}: {
  displayProducts: any[];
  totalRevenue: number;
  totalSales: number;
  activeProducts: number;
  onDeleteProduct?: (id: string) => void;
  onCreateProduct?: () => void;
  onOpenFeature?: (productId: string, feature: string) => void;
  requestedFeature?: string;
}) {
  const flashElRef = useRef<HTMLDivElement>(null);
  const revElRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const activePlanCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.activePlansCount || 0),
    0,
  );
  const memberAreaCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.memberAreasCount || 0),
    0,
  );
  const affiliateCount = displayProducts.reduce(
    (sum, product) => sum + Number(product.affiliateCount || 0),
    0,
  );
  const productEvents =
    displayProducts.length > 0
      ? displayProducts.slice(0, 4).map((product: any) => ({
          text:
            product.totalSales > 0
              ? `${product.name} somou ${product.totalSales} vendas aprovadas.`
              : `${product.name} está pronto para receber tráfego e checkout.`,
          time: timeAgo(product.updatedAt || product.createdAt),
        }))
      : [{ text: 'Aguardando criação do primeiro produto.', time: '' }];

  // Revenue ticker animation
  const displayRevRef = useRef(totalRevenue);
  useEffect(() => {
    displayRevRef.current = totalRevenue;
    if (revElRef.current) {
      revElRef.current.textContent = fmtBRL(totalRevenue);
    }
  }, [totalRevenue]);

  // Revenue per product bar chart
  const maxRevenue = Math.max(...displayProducts.map((p: any) => p.revenue || 0), 1);

  return (
    <div style={{ opacity: 1 }}>
      {/* Novo produto + Export + Equipe */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <button
          aria-label="Equipe"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.href = '/parcerias/colaboradores';
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '10px 16px',
            background: 'none',
            border: '1px solid #222226',
            borderRadius: 6,
            color: '#6E6E73',
            fontFamily: SORA,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Equipe
        </button>
        <button
          onClick={() => {
            if (!displayProducts.length) return;
            const escape = (v: unknown) => {
              const s = String(v ?? '');
              return `"${s.replace(/"/g, '""')}"`;
            };
            const rows = displayProducts.map((p: any) => ({
              nome: p.name,
              preco: p.price,
              categoria: p.category || '',
              formato: p.format || '',
              status: p.active ? 'Ativo' : 'Inativo',
            }));
            const headers = Object.keys(rows[0]);
            const csv = [
              headers.join(';'),
              ...rows.map((r: any) => headers.map((h) => escape(r[h])).join(';')),
            ].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `produtos-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '10px 16px',
            background: 'none',
            border: '1px solid #222226',
            borderRadius: 6,
            color: '#6E6E73',
            fontFamily: SORA,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Exportar
        </button>
        <button
          onClick={onCreateProduct}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 20px',
            background: EMBER,
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ color: '#fff' }}>{IC.plus(16)}</span> Novo produto
        </button>
      </div>

      {/* Revenue Hero -- 80px glow */}
      <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 200,
            height: 80,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${EMBER}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out',
            pointerEvents: 'none',
          }}
        />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: '#3A3A3F',
              letterSpacing: '0.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 4,
            }}
          >
            RECEITA TOTAL DOS SEUS PRODUTOS
          </div>
          <div
            ref={flashElRef}
            style={{
              fontFamily: MONO,
              fontSize: 80,
              fontWeight: 700,
              color: EMBER,
              letterSpacing: '-0.02em',
              textShadow: '0 0 20px rgba(232,93,48,0.3)',
              transition: 'text-shadow .3s',
            }}
          >
            <span ref={revElRef}>{fmtBRL(totalRevenue)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 8,
            }}
          >
            <NP w={40} h={14} color={EMBER} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>
              {activeProducts > 0
                ? `${activeProducts}/${displayProducts.length} ativos`
                : 'Ative seu primeiro produto'}
            </span>
          </div>
        </div>
      </div>

      {/* Sale Ticker 22s */}
      <Ticker
        items={
          displayProducts.length > 0
            ? displayProducts.map(
                (p: any) =>
                  `+R$ ${p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${p.name}`,
              )
            : ['Aguardando vendas...']
        }
        color={EMBER}
        duration="22s"
      />

      {/* Product Nerve Fibers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '20px 0' }}>
        {displayProducts.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ color: EMBER, display: 'block', marginBottom: 12 }}>{IC.box(32)}</span>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 14,
                fontWeight: 600,
                color: '#E0DDD8',
                marginBottom: 6,
              }}
            >
              Nenhum produto cadastrado.
            </div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: '#6E6E73', marginBottom: 16 }}>
              {requestedFeature
                ? 'Crie seu primeiro produto para liberar esta configuracao operacional.'
                : 'Crie seu primeiro produto para comecar a vender.'}
            </div>
            <button
              onClick={onCreateProduct}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 24px',
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#fff' }}>{IC.plus(16)}</span>
              {requestedFeature ? 'Criar produto e continuar' : 'Criar produto'}
            </button>
          </div>
        )}
        {displayProducts.map((p: any) => {
          const statusColor =
            p.status === 'active' ? EMBER : p.status === 'pending' ? '#6E6E73' : '#3A3A3F';
          const statusLabel =
            p.status === 'active' ? 'Ativo' : p.status === 'pending' ? 'Em analise' : 'Rascunho';
          const quickActions = [
            { label: 'Recomenda', feature: 'recommendation' },
            { label: 'Checkout', feature: 'checkout-appearance' },
            { label: 'Widget', feature: 'payment-widget' },
            { label: 'Cupom', feature: 'coupon' },
            { label: 'Bump', feature: 'order-bump' },
            { label: 'Coprod', feature: 'coproduction' },
          ];
          return (
            <div
              key={p.id}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px 14px 20px',
                background: BG_CARD,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                overflow: 'hidden',
              }}
            >
              {/* 3px left bar */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: p.color || EMBER,
                }}
              />
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${BORDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 6,
                  flexShrink: 0,
                }}
              >
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt=""
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: 4,
                      display: 'block',
                    }}
                  />
                ) : (
                  <span style={{ color: p.color || EMBER }}>{IC.box(20)}</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>
                  {p.name}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: '#3A3A3F', marginTop: 2 }}>
                  {p.category} &middot; {fmtBRL(p.price)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {quickActions.map((action) => (
                    <button
                      key={action.feature}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFeature?.(p.id, action.feature);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: `1px solid ${BORDER}`,
                        background:
                          requestedFeature === action.feature
                            ? 'rgba(232,93,48,0.12)'
                            : 'transparent',
                        color: requestedFeature === action.feature ? EMBER : '#6E6E73',
                        fontFamily: SORA,
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* NP canvas inline */}
              <NP w={160} h={28} color={p.color || EMBER} />
              <div style={{ textAlign: 'right', minWidth: 100 }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: EMBER }}>
                  {fmtBRL(p.revenue)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    justifyContent: 'flex-end',
                    marginTop: 2,
                  }}
                >
                  <span
                    style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }}
                  />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>
                    {statusLabel}
                  </span>
                </div>
              </div>
              {/* Edit button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `/products/${p.id}`;
                }}
                title="Editar produto"
                style={{
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  color: '#6E6E73',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color .15s, background .15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#E85D30';
                  e.currentTarget.style.background = 'rgba(232,93,48,0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#6E6E73';
                  e.currentTarget.style.background = 'none';
                }}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Revenue per Product bar chart */}
      {displayProducts.length > 0 && (
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: '#E0DDD8',
              marginBottom: 16,
            }}
          >
            Receita por Produto
          </div>
          {displayProducts.map((p: any) => (
            <div key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 11, color: '#6E6E73' }}>{p.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: EMBER }}>
                  {fmtBRL(p.revenue)}
                </span>
              </div>
              <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.round((p.revenue / maxRevenue) * 100)}%`,
                    height: '100%',
                    background: `linear-gradient(to right, ${EMBER}50, ${EMBER})`,
                    borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Operacao Comercial */}
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ color: EMBER }}>{IC.trend(16)}</span>
          <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>
            Saude operacional
          </span>
        </div>
        {[
          {
            label: 'Produtos ativos',
            value: activeProducts,
            pct: displayProducts.length
              ? Math.round((activeProducts / displayProducts.length) * 100)
              : 0,
          },
          {
            label: 'Checkouts ativos',
            value: activePlanCount,
            pct: Math.min(100, activePlanCount * 10),
          },
          {
            label: 'Areas vinculadas',
            value: memberAreaCount,
            pct: Math.min(100, memberAreaCount * 15),
          },
          {
            label: 'Afiliados ativos',
            value: affiliateCount,
            pct: Math.min(100, affiliateCount * 5),
          },
        ].map((stage, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: SORA, fontSize: 11, color: '#6E6E73' }}>
                {stage.label}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#E0DDD8' }}>
                {fmt(stage.value)} ({stage.pct}%)
              </span>
            </div>
            <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${stage.pct}%`,
                  height: '100%',
                  background: EMBER,
                  borderRadius: 2,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Motor de Vendas IA */}
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
          borderLeft: `3px solid ${EMBER}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: EMBER }}>{IC.zap(16)}</span>
          <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>
            Motor IA
          </span>
          <NP w={40} h={14} color={EMBER} />
        </div>
        <div style={{ fontFamily: SORA, fontSize: 12, color: '#6E6E73', lineHeight: 1.6 }}>
          {displayProducts.length > 0
            ? `Seu catálogo já tem ${activePlanCount} checkout${activePlanCount === 1 ? '' : 's'} ativo${activePlanCount === 1 ? '' : 's'} e ${affiliateCount} afiliado${affiliateCount === 1 ? '' : 's'} conectado${affiliateCount === 1 ? '' : 's'}.`
            : 'Crie seu primeiro produto para receber insights de IA sobre conversao e estrategias de venda.'}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          {
            label: 'Receita',
            value: fmtBRL(totalRevenue),
            sub: `${displayProducts.length} produtos no catalogo`,
            icon: IC.box,
          },
          {
            label: 'Vendas',
            value: String(totalSales),
            sub: `${activePlanCount} checkout${activePlanCount === 1 ? '' : 's'} ativo${activePlanCount === 1 ? '' : 's'}`,
            icon: IC.store,
          },
          {
            label: 'Ativos',
            value: String(activeProducts),
            sub: `${memberAreaCount} areas de membros`,
            icon: IC.zap,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: EMBER }}>{s.icon(18)}</span>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#3A3A3F',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: '#E0DDD8' }}>
              {s.value}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: EMBER, marginTop: 4 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Live Feed */}
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            fontWeight: 600,
            color: '#3A3A3F',
            marginBottom: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
          }}
        >
          Feed ao Vivo
        </div>
        <LiveFeed color={EMBER} events={productEvents} />
      </div>
    </div>
  );
}

// ═════════════════════════════════
// TAB: Area de Membros (purple)
// ═════════════════════════════════
function AreaMembros({
  totalStudents,
  displayAreas,
  avgCompletion,
  mutateAreas,
  productOptions,
}: {
  totalStudents: number;
  displayAreas: any[];
  avgCompletion: number;
  mutateAreas: () => void;
  productOptions: any[];
}) {
  const {
    createArea,
    updateArea,
    deleteArea,
    createModule,
    updateModule,
    deleteModule,
    createLesson,
    updateLesson,
    deleteLesson,
  } = useMemberAreaMutations();
  const emptyAreaForm = {
    name: '',
    slug: '',
    description: '',
    type: 'COURSE',
    productId: '',
    template: 'academy',
    logoUrl: '',
    coverUrl: '',
    primaryColor: PURPLE,
    certificates: true,
    quizzes: true,
    community: true,
    gamification: true,
    progressTrack: true,
    downloads: true,
    comments: true,
    active: true,
  };

  // ── CRUD State ──
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const [showCreateArea, setShowCreateArea] = useState(false);
  const [newArea, setNewArea] = useState(emptyAreaForm);
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editAreaData, setEditAreaData] = useState(emptyAreaForm);
  const [creatingModule, setCreatingModule] = useState<string | null>(null);
  const [newModule, setNewModule] = useState({ name: '' });
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [editModuleData, setEditModuleData] = useState({ name: '' });
  const [creatingLesson, setCreatingLesson] = useState<string | null>(null);
  const [newLesson, setNewLesson] = useState({ name: '', description: '', videoUrl: '' });
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [editLessonData, setEditLessonData] = useState({ name: '', description: '', videoUrl: '' });
  const [saving, setSaving] = useState(false);
  const [generatingAreaId, setGeneratingAreaId] = useState<string | null>(null);

  // ── Student Enrollment State ──
  const [studentAreaId, setStudentAreaId] = useState<string | null>(null);
  const [studentAreaName, setStudentAreaName] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', phone: '' });
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editStudentData, setEditStudentData] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'active',
    progress: '0',
  });
  const [studentLoading, setStudentLoading] = useState(false);

  const fetchStudents = async (areaId: string, q?: string) => {
    setStudentLoading(true);
    try {
      const url = q
        ? `/member-areas/${areaId}/students?q=${encodeURIComponent(q)}`
        : `/member-areas/${areaId}/students`;
      const res = await apiFetch(url);
      setStudents(Array.isArray(res) ? res : (res as any)?.students || []);
    } catch {
      setStudents([]);
    }
    setStudentLoading(false);
  };
  const openStudentDrawer = (areaId: string, areaName: string) => {
    setStudentAreaId(areaId);
    setStudentAreaName(areaName);
    setStudentSearch('');
    setShowAddStudent(false);
    setEditingStudentId(null);
    setEditStudentData({ name: '', email: '', phone: '', status: 'active', progress: '0' });
    setNewStudent({ name: '', email: '', phone: '' });
    fetchStudents(areaId);
  };
  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.email || !studentAreaId) return;
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students`, {
        method: 'POST',
        body: {
          studentName: newStudent.name,
          studentEmail: newStudent.email,
          studentPhone: newStudent.phone,
        },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/member-areas'));
      setNewStudent({ name: '', email: '', phone: '' });
      setShowAddStudent(false);
      fetchStudents(studentAreaId);
      mutateAreas();
    } catch {
      /* error */
    }
    setSaving(false);
  };
  const handleRemoveStudent = async (studentId: string) => {
    if (!studentAreaId) return;
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students/${studentId}`, { method: 'DELETE' });
      fetchStudents(studentAreaId);
      mutateAreas();
    } catch {
      /* error */
    }
    setSaving(false);
  };
  const handleStartEditStudent = (student: any) => {
    setEditingStudentId(student.id);
    setEditStudentData({
      name: student.studentName || '',
      email: student.studentEmail || '',
      phone: student.studentPhone || '',
      status: student.status || 'active',
      progress: String(Number(student.progress || 0)),
    });
  };
  const handleUpdateStudent = async () => {
    if (!studentAreaId || !editingStudentId || !editStudentData.name || !editStudentData.email)
      return;
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students/${editingStudentId}`, {
        method: 'PUT',
        body: {
          studentName: editStudentData.name,
          studentEmail: editStudentData.email,
          studentPhone: editStudentData.phone || null,
          status: editStudentData.status,
          progress: Math.max(0, Math.min(100, Number(editStudentData.progress) || 0)),
        },
      });
      setEditingStudentId(null);
      fetchStudents(studentAreaId, studentSearch || undefined);
      mutateAreas();
    } catch {
      /* error */
    }
    setSaving(false);
  };
  const handleToggleStudentStatus = async (student: any) => {
    if (!studentAreaId) return;
    setSaving(true);
    try {
      await apiFetch(`/member-areas/${studentAreaId}/students/${student.id}`, {
        method: 'PUT',
        body: { status: student.status === 'active' ? 'suspended' : 'active' },
      });
      fetchStudents(studentAreaId, studentSearch || undefined);
      mutateAreas();
    } catch {
      /* error */
    }
    setSaving(false);
  };
  const handleSearchStudents = (q: string) => {
    setStudentSearch(q);
    if (studentAreaId) fetchStudents(studentAreaId, q || undefined);
  };

  const toggleArea = (id: string) => setExpandedAreas((prev) => ({ ...prev, [id]: !prev[id] }));

  // YouTube URL to embed
  const toEmbed = (url: string) => {
    if (!url) return '';
    const m = url.match(/(?:watch\?v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : '';
  };

  // ── Handlers ──
  const handleCreateArea = async () => {
    if (!newArea.name.trim()) return;
    setSaving(true);
    try {
      await createArea({
        name: newArea.name.trim(),
        slug: newArea.slug.trim() || undefined,
        description: newArea.description.trim() || undefined,
        type: newArea.type,
        productId: newArea.productId || undefined,
        template: newArea.template,
        logoUrl: newArea.logoUrl.trim() || undefined,
        coverUrl: newArea.coverUrl.trim() || undefined,
        primaryColor: newArea.primaryColor,
        certificates: newArea.certificates,
        quizzes: newArea.quizzes,
        community: newArea.community,
        gamification: newArea.gamification,
        progressTrack: newArea.progressTrack,
        downloads: newArea.downloads,
        comments: newArea.comments,
        active: newArea.active,
      });
      mutateAreas();
      setNewArea(emptyAreaForm);
      setShowCreateArea(false);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleUpdateArea = async (id: string) => {
    if (!editAreaData.name.trim()) return;
    setSaving(true);
    try {
      await updateArea(id, {
        name: editAreaData.name.trim(),
        slug: editAreaData.slug.trim() || undefined,
        description: editAreaData.description.trim() || undefined,
        type: editAreaData.type,
        productId: editAreaData.productId || null,
        template: editAreaData.template,
        logoUrl: editAreaData.logoUrl.trim() || undefined,
        coverUrl: editAreaData.coverUrl.trim() || undefined,
        primaryColor: editAreaData.primaryColor,
        certificates: editAreaData.certificates,
        quizzes: editAreaData.quizzes,
        community: editAreaData.community,
        gamification: editAreaData.gamification,
        progressTrack: editAreaData.progressTrack,
        downloads: editAreaData.downloads,
        comments: editAreaData.comments,
        active: editAreaData.active,
      });
      mutateAreas();
      setEditingArea(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDeleteArea = async (id: string) => {
    if (!confirm('Excluir esta area?')) return;
    setSaving(true);
    try {
      await deleteArea(id);
      mutateAreas();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleCreateModule = async (areaId: string) => {
    if (!newModule.name.trim()) return;
    setSaving(true);
    try {
      await createModule(areaId, { name: newModule.name.trim() });
      mutateAreas();
      setNewModule({ name: '' });
      setCreatingModule(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleUpdateModule = async (areaId: string, moduleId: string) => {
    if (!editModuleData.name.trim()) return;
    setSaving(true);
    try {
      await updateModule(areaId, moduleId, { name: editModuleData.name.trim() });
      mutateAreas();
      setEditingModule(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDeleteModule = async (areaId: string, moduleId: string) => {
    if (!confirm('Excluir este modulo?')) return;
    setSaving(true);
    try {
      await deleteModule(areaId, moduleId);
      mutateAreas();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleCreateLesson = async (areaId: string, moduleId: string) => {
    if (!newLesson.name.trim()) return;
    setSaving(true);
    try {
      await createLesson(areaId, moduleId, {
        name: newLesson.name.trim(),
        description: newLesson.description.trim(),
        videoUrl: newLesson.videoUrl.trim(),
      });
      mutateAreas();
      setNewLesson({ name: '', description: '', videoUrl: '' });
      setCreatingLesson(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleUpdateLesson = async (areaId: string, lessonId: string) => {
    if (!editLessonData.name.trim()) return;
    setSaving(true);
    try {
      await updateLesson(areaId, lessonId, {
        name: editLessonData.name.trim(),
        description: editLessonData.description.trim(),
        videoUrl: editLessonData.videoUrl.trim(),
      });
      mutateAreas();
      setEditingLesson(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDeleteLesson = async (areaId: string, lessonId: string) => {
    if (!confirm('Excluir esta aula?')) return;
    setSaving(true);
    try {
      await deleteLesson(areaId, lessonId);
      mutateAreas();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleGenerateStructure = async (areaId: string) => {
    setGeneratingAreaId(areaId);
    try {
      await apiFetch(`/member-areas/${areaId}/generate-structure`, { method: 'POST' });
      mutateAreas();
      setExpandedAreas((prev) => ({ ...prev, [areaId]: true }));
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingAreaId(null);
    }
  };

  const activeAreas = displayAreas.filter((area: any) => area.active !== false).length;
  const totalModules = displayAreas.reduce(
    (sum: number, area: any) => sum + Number(area.modulesCount || area.modules || 0),
    0,
  );
  const totalLessons = displayAreas.reduce(
    (sum: number, area: any) => sum + Number(area.lessonsCount || 0),
    0,
  );
  const certificatesEnabled = displayAreas.filter(
    (area: any) => area.certificates !== false,
  ).length;
  const communityEnabled = displayAreas.filter((area: any) => area.community === true).length;
  const memberEvents =
    displayAreas.length > 0
      ? displayAreas.slice(0, 4).map((area: any) => ({
          text:
            Number(area.students || 0) > 0
              ? `${area.name} tem ${area.students} aluno${Number(area.students || 0) === 1 ? '' : 's'} ativo${Number(area.students || 0) === 1 ? '' : 's'}.`
              : `${area.name} ainda não tem matrículas.`,
          time: timeAgo(area.updatedAt || area.createdAt),
        }))
      : [{ text: 'Aguardando a primeira área de membros.', time: '' }];

  return (
    <div style={{ opacity: 1 }}>
      {/* Students Hero -- 80px purple glow */}
      <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 200,
            height: 80,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${PURPLE}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out',
            pointerEvents: 'none',
          }}
        />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: '#3A3A3F',
              letterSpacing: '0.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 4,
            }}
          >
            Total de Alunos
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 80,
              fontWeight: 700,
              color: PURPLE,
              letterSpacing: '-0.02em',
            }}
          >
            {totalStudents.toLocaleString('pt-BR')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 8,
            }}
          >
            <NP w={40} h={14} color={PURPLE} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: PURPLE }}>
              {activeAreas > 0
                ? `${activeAreas}/${displayAreas.length} areas ativas`
                : 'Nenhuma area ativa'}
            </span>
          </div>
        </div>
      </div>

      {/* Engagement Pulse Strip with dual NP */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: BG_CARD,
          borderRadius: 6,
          border: `1px solid ${BORDER}`,
          marginBottom: 20,
        }}
      >
        <NP w={120} h={24} color={PURPLE} />
        <span
          style={{ fontFamily: MONO, fontSize: 11, color: PURPLE, flex: 1, textAlign: 'center' }}
        >
          Engagement Pulse
        </span>
        <NP w={120} h={24} color={PURPLE} />
      </div>

      {/* Ticker */}
      <Ticker
        items={
          displayAreas.length > 0
            ? displayAreas.map((a: any) => `${a.name}: ${a.students} alunos`)
            : ['Aguardando alunos...']
        }
        color={PURPLE}
      />

      {/* Areas stat cards */}
      <div style={{ display: 'flex', gap: 12, padding: '20px 0' }}>
        {[
          {
            icon: IC.users,
            label: 'Alunos',
            value: String(totalStudents),
            sub: `${activeAreas} areas ativas`,
          },
          {
            icon: IC.trend,
            label: 'Conclusao',
            value: `${avgCompletion}%`,
            sub: `${totalLessons} aulas publicadas`,
          },
          {
            icon: IC.book,
            label: 'Areas',
            value: String(displayAreas.length),
            sub: `${totalModules} modulos`,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: PURPLE }}>{s.icon(18)}</span>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#3A3A3F',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: '#E0DDD8' }}>
              {s.value}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: PURPLE, marginTop: 4 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Completion bars per area */}
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            color: '#E0DDD8',
            marginBottom: 16,
          }}
        >
          Progresso por Area
        </div>
        {displayAreas
          .filter((a: any) => a.completion > 0)
          .map((a: any) => (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8' }}>{a.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: PURPLE }}>
                  {a.completion}%
                </span>
              </div>
              <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${a.completion}%`,
                    height: '100%',
                    background: `linear-gradient(to right, ${PURPLE}50, ${PURPLE})`,
                    borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
            </div>
          ))}
      </div>

      {/* Resource snapshot */}
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 20,
          marginBottom: 16,
          borderLeft: `3px solid ${PURPLE}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: PURPLE }}>{IC.star(18)}</span>
          <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>
            Recursos liberados
          </span>
          <NP w={40} h={14} color={PURPLE} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Areas com certificado', value: String(certificatesEnabled) },
            { label: 'Areas com comunidade', value: String(communityEnabled) },
            { label: 'Modulos publicados', value: String(totalModules) },
            { label: 'Aulas publicadas', value: String(totalLessons) },
          ].map((c, i) => (
            <div key={i} style={{ padding: '10px 14px', background: BG_ELEVATED, borderRadius: 6 }}>
              <div style={{ fontFamily: SORA, fontSize: 10, color: '#3A3A3F', marginBottom: 4 }}>
                {c.label}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: '#E0DDD8' }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CRUD: Areas Management */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>
            Gerenciar Areas
          </div>
          <button
            onClick={() => setShowCreateArea(!showCreateArea)}
            style={{
              ...btnPrimary(PURPLE),
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: saving ? 0.6 : 1,
            }}
            disabled={saving}
          >
            <span style={{ color: '#fff' }}>{IC.plus(14)}</span> Criar area
          </button>
        </div>

        {/* Create Area Form */}
        {showCreateArea && (
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 11,
                fontWeight: 600,
                color: '#3A3A3F',
                letterSpacing: '0.15em',
                textTransform: 'uppercase' as const,
                marginBottom: 10,
              }}
            >
              Nova Area
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1.3 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Nome
                </label>
                <input
                  value={newArea.name}
                  onChange={(e) => setNewArea((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome da area..."
                  style={inputStyle}
                />
              </div>
              <div style={{ width: 160 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Tipo
                </label>
                <select
                  value={newArea.type}
                  onChange={(e) => setNewArea((p) => ({ ...p, type: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="COURSE">Curso</option>
                  <option value="COMMUNITY">Comunidade</option>
                  <option value="HYBRID">Hibrido</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Produto vinculado
                </label>
                <select
                  value={newArea.productId}
                  onChange={(e) => setNewArea((p) => ({ ...p, productId: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">Sem vinculo</option>
                  {productOptions.map((product: any) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              style={{ display: 'grid', gap: 10, gridTemplateColumns: '1.5fr 1fr', marginTop: 10 }}
            >
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Slug
                </label>
                <input
                  value={newArea.slug}
                  onChange={(e) => setNewArea((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="minha-area-de-membros"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Cor principal
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={newArea.primaryColor}
                    onChange={(e) => setNewArea((p) => ({ ...p, primaryColor: e.target.value }))}
                    style={{
                      width: 44,
                      height: 38,
                      background: 'transparent',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    value={newArea.primaryColor}
                    onChange={(e) => setNewArea((p) => ({ ...p, primaryColor: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              </div>
            </div>
            <div
              style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginTop: 10 }}
            >
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Descricao
                </label>
                <input
                  value={newArea.description}
                  onChange={(e) => setNewArea((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Resumo da experiencia para o aluno"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Template
                </label>
                <select
                  value={newArea.template}
                  onChange={(e) => setNewArea((p) => ({ ...p, template: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="academy">Academy</option>
                  <option value="community">Community</option>
                  <option value="membership">Membership</option>
                </select>
              </div>
            </div>
            <div
              style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginTop: 10 }}
            >
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Logo da area
                </label>
                <input
                  value={newArea.logoUrl}
                  onChange={(e) => setNewArea((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#6E6E73',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Capa da area
                </label>
                <input
                  value={newArea.coverUrl}
                  onChange={(e) => setNewArea((p) => ({ ...p, coverUrl: e.target.value }))}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
              {[
                { key: 'certificates', label: 'Certificados' },
                { key: 'quizzes', label: 'Quizzes' },
                { key: 'community', label: 'Comunidade' },
                { key: 'gamification', label: 'Gamificacao' },
                { key: 'progressTrack', label: 'Progresso' },
                { key: 'downloads', label: 'Downloads' },
                { key: 'comments', label: 'Comentarios' },
              ].map((toggle) => (
                <label
                  key={toggle.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: '#6E6E73',
                    fontFamily: SORA,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(newArea as any)[toggle.key]}
                    onChange={(e) =>
                      setNewArea((prev) => ({ ...prev, [toggle.key]: e.target.checked }))
                    }
                  />
                  {toggle.label}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
              <button
                onClick={handleCreateArea}
                disabled={saving}
                style={{ ...btnPrimary(PURPLE), opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Salvando...' : 'Criar'}
              </button>
              <button
                onClick={() => {
                  setShowCreateArea(false);
                  setNewArea(emptyAreaForm);
                }}
                style={btnGhost}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Areas list with expand/collapse */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayAreas.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ color: PURPLE, display: 'block', marginBottom: 12 }}>
              {IC.users(32)}
            </span>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 14,
                fontWeight: 600,
                color: '#E0DDD8',
                marginBottom: 6,
              }}
            >
              Nenhuma area de membros cadastrada.
            </div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: '#6E6E73' }}>
              Crie sua primeira area clicando em &quot;Criar area&quot; acima.
            </div>
          </div>
        )}
        {displayAreas.map((a: any) => {
          const isExpanded = expandedAreas[a.id];
          const isEditing = editingArea === a.id;
          const modules: any[] = a.modules_list || a.modulesList || [];
          const areaAccent = a.primaryColor || PURPLE;

          return (
            <div
              key={a.id}
              style={{
                background: BG_CARD,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                overflow: 'hidden',
              }}
            >
              {/* Area header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: areaAccent,
                  }}
                />

                {/* Expand toggle */}
                <button
                  onClick={() => toggleArea(a.id)}
                  style={{
                    ...iconBtn,
                    color: areaAccent,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                    transition: 'transform 150ms ease',
                  }}
                >
                  {IC.chevRight(18)}
                </button>

                {isEditing ? (
                  /* Inline edit form */
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1.5fr 1fr 1fr' }}>
                      <input
                        aria-label="Nome da area"
                        value={editAreaData.name}
                        onChange={(e) => setEditAreaData((p) => ({ ...p, name: e.target.value }))}
                        style={{ ...inputStyle, flex: 1 }}
                        autoFocus
                      />
                      <select
                        value={editAreaData.type}
                        onChange={(e) => setEditAreaData((p) => ({ ...p, type: e.target.value }))}
                        style={selectStyle}
                      >
                        <option value="COURSE">Curso</option>
                        <option value="COMMUNITY">Comunidade</option>
                        <option value="HYBRID">Hibrido</option>
                        <option value="MEMBERSHIP">Membership</option>
                      </select>
                      <select
                        value={editAreaData.productId}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, productId: e.target.value }))
                        }
                        style={selectStyle}
                      >
                        <option value="">Sem vinculo</option>
                        {productOptions.map((product: any) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: '1.5fr 1fr',
                        marginTop: 8,
                      }}
                    >
                      <input
                        aria-label="Descricao da area"
                        value={editAreaData.description}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, description: e.target.value }))
                        }
                        placeholder="Descricao da area"
                        style={inputStyle}
                      />
                      <select
                        value={editAreaData.template}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, template: e.target.value }))
                        }
                        style={selectStyle}
                      >
                        <option value="academy">Academy</option>
                        <option value="community">Community</option>
                        <option value="membership">Membership</option>
                      </select>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: '1fr 1fr',
                        marginTop: 8,
                      }}
                    >
                      <input
                        aria-label="Slug da area"
                        value={editAreaData.slug}
                        onChange={(e) => setEditAreaData((p) => ({ ...p, slug: e.target.value }))}
                        placeholder="Slug da area"
                        style={inputStyle}
                      />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="color"
                          value={editAreaData.primaryColor}
                          onChange={(e) =>
                            setEditAreaData((p) => ({ ...p, primaryColor: e.target.value }))
                          }
                          style={{
                            width: 44,
                            height: 38,
                            background: 'transparent',
                            border: `1px solid ${BORDER}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        />
                        <input
                          aria-label="Cor principal da area"
                          value={editAreaData.primaryColor}
                          onChange={(e) =>
                            setEditAreaData((p) => ({ ...p, primaryColor: e.target.value }))
                          }
                          placeholder="#8B5CF6"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        gridTemplateColumns: '1fr 1fr',
                        marginTop: 8,
                      }}
                    >
                      <input
                        aria-label="Logo da area"
                        value={editAreaData.logoUrl}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, logoUrl: e.target.value }))
                        }
                        placeholder="Logo da area"
                        style={inputStyle}
                      />
                      <input
                        aria-label="Capa da area"
                        value={editAreaData.coverUrl}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, coverUrl: e.target.value }))
                        }
                        placeholder="Capa da area"
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                      {[
                        { key: 'certificates', label: 'Certificados' },
                        { key: 'quizzes', label: 'Quizzes' },
                        { key: 'community', label: 'Comunidade' },
                        { key: 'gamification', label: 'Gamificacao' },
                        { key: 'progressTrack', label: 'Progresso' },
                        { key: 'downloads', label: 'Downloads' },
                        { key: 'comments', label: 'Comentarios' },
                        { key: 'active', label: 'Ativa' },
                      ].map((toggle) => (
                        <label
                          key={toggle.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11,
                            color: '#6E6E73',
                            fontFamily: SORA,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={(editAreaData as any)[toggle.key]}
                            onChange={(e) =>
                              setEditAreaData((prev) => ({
                                ...prev,
                                [toggle.key]: e.target.checked,
                              }))
                            }
                          />
                          {toggle.label}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => handleUpdateArea(a.id)}
                        disabled={saving}
                        style={{ ...btnPrimary(PURPLE), fontSize: 11, padding: '6px 12px' }}
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditingArea(null)}
                        style={{ ...btnGhost, fontSize: 11, padding: '6px 12px' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Read-only display */
                  <>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: `${areaAccent}15`,
                        border: `1px solid ${areaAccent}30`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {a.logoUrl ? (
                        <img
                          src={a.logoUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ color: areaAccent }}>{IC.users(18)}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => toggleArea(a.id)}>
                      <div
                        style={{
                          fontFamily: SORA,
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#E0DDD8',
                        }}
                      >
                        {a.name}
                      </div>
                      <div
                        style={{ fontFamily: MONO, fontSize: 11, color: '#3A3A3F', marginTop: 2 }}
                      >
                        {a.type === 'COURSE'
                          ? 'Curso'
                          : a.type === 'COMMUNITY'
                            ? 'Comunidade'
                            : a.type === 'HYBRID'
                              ? 'Hibrido'
                              : a.type}{' '}
                        &middot; {typeof a.modules === 'number' ? a.modules : modules.length}{' '}
                        modulos
                      </div>
                      {a.slug && (
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            color: areaAccent,
                            marginTop: 4,
                          }}
                        >
                          /{a.slug}
                        </div>
                      )}
                    </div>
                    <NP w={100} h={22} color={areaAccent} />
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#E0DDD8',
                        }}
                      >
                        {a.students} alunos
                      </div>
                      {a.completion > 0 && (
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            color: areaAccent,
                            marginTop: 2,
                          }}
                        >
                          {a.completion}% conclusao
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => openStudentDrawer(a.id, a.name)}
                      style={{ ...iconBtn, color: '#E85D30' }}
                      title="Gerenciar alunos"
                    >
                      <svg
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </button>
                    <button
                      onClick={() =>
                        window.open(`/produtos/area-membros/preview/${a.id}`, '_blank')
                      }
                      style={{ ...iconBtn, color: '#E85D30' }}
                      title="Pre-visualizar como aluno"
                    >
                      <svg
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        setEditingArea(a.id);
                        setEditAreaData({
                          name: a.name,
                          slug: a.slug || '',
                          description: a.description || '',
                          type: a.type || 'COURSE',
                          productId: a.productId || '',
                          template: a.template || 'academy',
                          logoUrl: a.logoUrl || '',
                          coverUrl: a.coverUrl || '',
                          primaryColor: a.primaryColor || PURPLE,
                          certificates: a.certificates !== false,
                          quizzes: a.quizzes !== false,
                          community: a.community === true,
                          gamification: a.gamification !== false,
                          progressTrack: a.progressTrack !== false,
                          downloads: a.downloads !== false,
                          comments: a.comments !== false,
                          active: a.active !== false,
                        });
                      }}
                      style={{ ...iconBtn, color: '#6E6E73' }}
                      title="Editar area"
                    >
                      {IC.edit(16)}
                    </button>
                    <button
                      onClick={() => handleDeleteArea(a.id)}
                      style={{ ...iconBtn, color: '#EF4444' }}
                      title="Excluir area"
                    >
                      {IC.trash(16)}
                    </button>
                  </>
                )}
              </div>

              {/* Expanded: modules & lessons */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 16px 16px 40px' }}>
                  <div
                    style={{
                      background: BG_ELEVATED,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    {(a.coverUrl || a.logoUrl) && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '180px 1fr',
                          gap: 12,
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            height: 96,
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: '#0A0A0C',
                            border: `1px solid ${BORDER}`,
                          }}
                        >
                          {a.coverUrl ? (
                            <img
                              src={a.coverUrl}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: areaAccent,
                              }}
                            >
                              {IC.book(24)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {a.logoUrl ? (
                            <div
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 12,
                                overflow: 'hidden',
                                border: `1px solid ${BORDER}`,
                                background: '#0A0A0C',
                                flexShrink: 0,
                              }}
                            >
                              <img
                                src={a.logoUrl}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            </div>
                          ) : null}
                          <div>
                            <div
                              style={{
                                fontFamily: SORA,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#E0DDD8',
                              }}
                            >
                              {a.name}
                            </div>
                            <div
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                color: '#6E6E73',
                                marginTop: 2,
                              }}
                            >
                              {a.slug ? `/${a.slug}` : 'Slug automatico'} &middot;{' '}
                              {a.template || 'academy'}
                            </div>
                            <div
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                color: areaAccent,
                                marginTop: 4,
                              }}
                            >
                              Cor principal {a.primaryColor || PURPLE}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: SORA,
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#E0DDD8',
                          }}
                        >
                          Configuracao da area
                        </div>
                        <div
                          style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F', marginTop: 2 }}
                        >
                          {a.template || 'academy'} &middot;{' '}
                          {a.productName || 'Sem produto vinculado'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleGenerateStructure(a.id)}
                          disabled={
                            generatingAreaId === a.id ||
                            (Array.isArray(modules) && modules.length > 0)
                          }
                          style={{
                            ...btnGhost,
                            color: generatingAreaId === a.id ? '#E0DDD8' : areaAccent,
                            borderColor: areaAccent,
                            opacity: generatingAreaId === a.id || modules.length > 0 ? 0.5 : 1,
                          }}
                        >
                          {generatingAreaId === a.id
                            ? 'Gerando...'
                            : modules.length > 0
                              ? 'Estrutura pronta'
                              : 'Gerar estrutura IA'}
                        </button>
                        <button
                          onClick={() =>
                            window.open(`/produtos/area-membros/preview/${a.id}`, '_blank')
                          }
                          style={{ ...btnGhost, color: '#E85D30' }}
                        >
                          Preview do aluno
                        </button>
                      </div>
                    </div>
                    <div
                      style={{ fontFamily: SORA, fontSize: 12, color: '#6E6E73', lineHeight: 1.6 }}
                    >
                      {a.description ||
                        'Adicione uma descrição para orientar o aluno e dar contexto à jornada.'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {[
                        a.certificates !== false ? 'Certificados' : null,
                        a.quizzes !== false ? 'Quizzes' : null,
                        a.community === true ? 'Comunidade' : null,
                        a.gamification !== false ? 'Gamificacao' : null,
                        a.progressTrack !== false ? 'Progresso' : null,
                        a.downloads !== false ? 'Downloads' : null,
                        a.comments !== false ? 'Comentários' : null,
                      ]
                        .filter(Boolean)
                        .map((label) => (
                          <span
                            key={label}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 999,
                              background: `${areaAccent}15`,
                              border: `1px solid ${areaAccent}30`,
                              color: areaAccent,
                              fontSize: 10,
                              fontWeight: 600,
                              fontFamily: SORA,
                            }}
                          >
                            {label}
                          </span>
                        ))}
                    </div>
                  </div>
                  {/* Modules list */}
                  {modules.length > 0 ? (
                    modules.map((mod: any) => {
                      const lessons: any[] = mod.lessons || [];
                      const isEditingMod = editingModule === mod.id;

                      return (
                        <div
                          key={mod.id}
                          style={{
                            marginBottom: 12,
                            background: BG_ELEVATED,
                            borderRadius: 6,
                            border: `1px solid ${BORDER}`,
                            padding: 12,
                          }}
                        >
                          {/* Module header */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: lessons.length > 0 ? 10 : 0,
                            }}
                          >
                            <span style={{ color: PURPLE }}>{IC.book(16)}</span>
                            {isEditingMod ? (
                              <div
                                style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}
                              >
                                <input
                                  aria-label="Nome do modulo"
                                  value={editModuleData.name}
                                  onChange={(e) => setEditModuleData({ name: e.target.value })}
                                  style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleUpdateModule(a.id, mod.id)}
                                  disabled={saving}
                                  style={{
                                    ...btnPrimary(PURPLE),
                                    fontSize: 10,
                                    padding: '5px 10px',
                                  }}
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => setEditingModule(null)}
                                  style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <>
                                <span
                                  style={{
                                    fontFamily: SORA,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#E0DDD8',
                                    flex: 1,
                                  }}
                                >
                                  {mod.name}
                                </span>
                                <span style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F' }}>
                                  {lessons.length} aulas
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingModule(mod.id);
                                    setEditModuleData({ name: mod.name });
                                  }}
                                  style={{ ...iconBtn, color: '#6E6E73' }}
                                  title="Editar modulo"
                                >
                                  {IC.edit(14)}
                                </button>
                                <button
                                  onClick={() => handleDeleteModule(a.id, mod.id)}
                                  style={{ ...iconBtn, color: '#EF4444' }}
                                  title="Excluir modulo"
                                >
                                  {IC.trash(14)}
                                </button>
                              </>
                            )}
                          </div>

                          {/* Lessons */}
                          {lessons.map((lesson: any) => {
                            const isEditingLes = editingLesson === lesson.id;
                            const embedUrl = toEmbed(lesson.videoUrl || '');

                            return (
                              <div
                                key={lesson.id}
                                style={{
                                  marginLeft: 16,
                                  padding: '8px 10px',
                                  borderLeft: `2px solid ${BORDER}`,
                                  marginBottom: 6,
                                }}
                              >
                                {isEditingLes ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <input
                                      aria-label="Nome da aula"
                                      value={editLessonData.name}
                                      onChange={(e) =>
                                        setEditLessonData((p) => ({ ...p, name: e.target.value }))
                                      }
                                      placeholder="Nome da aula"
                                      style={{ ...inputStyle, fontSize: 11 }}
                                      autoFocus
                                    />
                                    <input
                                      aria-label="Descricao da aula"
                                      value={editLessonData.description}
                                      onChange={(e) =>
                                        setEditLessonData((p) => ({
                                          ...p,
                                          description: e.target.value,
                                        }))
                                      }
                                      placeholder="Descricao"
                                      style={{ ...inputStyle, fontSize: 11 }}
                                    />
                                    <input
                                      aria-label="URL do video"
                                      value={editLessonData.videoUrl}
                                      onChange={(e) =>
                                        setEditLessonData((p) => ({
                                          ...p,
                                          videoUrl: e.target.value,
                                        }))
                                      }
                                      placeholder="YouTube URL"
                                      style={{ ...inputStyle, fontSize: 11 }}
                                    />
                                    {toEmbed(editLessonData.videoUrl) && (
                                      <div
                                        style={{
                                          borderRadius: 6,
                                          overflow: 'hidden',
                                          marginTop: 4,
                                        }}
                                      >
                                        <iframe
                                          src={toEmbed(editLessonData.videoUrl)}
                                          width="100%"
                                          height="180"
                                          style={{ border: 'none', borderRadius: 6 }}
                                          allowFullScreen
                                          title="Preview"
                                        />
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        onClick={() => handleUpdateLesson(a.id, lesson.id)}
                                        disabled={saving}
                                        style={{
                                          ...btnPrimary(PURPLE),
                                          fontSize: 10,
                                          padding: '5px 10px',
                                        }}
                                      >
                                        Salvar
                                      </button>
                                      <button
                                        onClick={() => setEditingLesson(null)}
                                        style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
                                  >
                                    <span style={{ color: PURPLE, marginTop: 2 }}>
                                      {IC.play(14)}
                                    </span>
                                    <div style={{ flex: 1 }}>
                                      <div
                                        style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8' }}
                                      >
                                        {lesson.name}
                                      </div>
                                      {lesson.description && (
                                        <div
                                          style={{
                                            fontFamily: MONO,
                                            fontSize: 10,
                                            color: '#3A3A3F',
                                            marginTop: 2,
                                          }}
                                        >
                                          {lesson.description}
                                        </div>
                                      )}
                                      {embedUrl && (
                                        <div
                                          style={{
                                            borderRadius: 6,
                                            overflow: 'hidden',
                                            marginTop: 6,
                                          }}
                                        >
                                          <iframe
                                            src={embedUrl}
                                            width="100%"
                                            height="180"
                                            style={{ border: 'none', borderRadius: 6 }}
                                            allowFullScreen
                                            title={lesson.name}
                                          />
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => {
                                        setEditingLesson(lesson.id);
                                        setEditLessonData({
                                          name: lesson.name,
                                          description: lesson.description || '',
                                          videoUrl: lesson.videoUrl || '',
                                        });
                                      }}
                                      style={{ ...iconBtn, color: '#6E6E73' }}
                                      title="Editar aula"
                                    >
                                      {IC.edit(14)}
                                    </button>
                                    <button
                                      onClick={() => handleDeleteLesson(a.id, lesson.id)}
                                      style={{ ...iconBtn, color: '#EF4444' }}
                                      title="Excluir aula"
                                    >
                                      {IC.trash(14)}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Add lesson to this module */}
                          {creatingLesson === mod.id ? (
                            <div
                              style={{
                                marginLeft: 16,
                                marginTop: 8,
                                padding: 10,
                                background: BG_CARD,
                                borderRadius: 6,
                                border: `1px solid ${BORDER}`,
                              }}
                            >
                              <div
                                style={{
                                  fontFamily: SORA,
                                  fontSize: 10,
                                  color: '#3A3A3F',
                                  letterSpacing: '0.15em',
                                  textTransform: 'uppercase' as const,
                                  marginBottom: 8,
                                }}
                              >
                                Nova Aula
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <input
                                  aria-label="Nome da aula"
                                  value={newLesson.name}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, name: e.target.value }))
                                  }
                                  placeholder="Nome da aula"
                                  style={{ ...inputStyle, fontSize: 11 }}
                                  autoFocus
                                />
                                <input
                                  aria-label="Descricao da aula"
                                  value={newLesson.description}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, description: e.target.value }))
                                  }
                                  placeholder="Descricao (opcional)"
                                  style={{ ...inputStyle, fontSize: 11 }}
                                />
                                <input
                                  aria-label="URL do video"
                                  value={newLesson.videoUrl}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, videoUrl: e.target.value }))
                                  }
                                  placeholder="YouTube URL (opcional)"
                                  style={{ ...inputStyle, fontSize: 11 }}
                                />
                                {toEmbed(newLesson.videoUrl) && (
                                  <div
                                    style={{ borderRadius: 6, overflow: 'hidden', marginTop: 4 }}
                                  >
                                    <iframe
                                      src={toEmbed(newLesson.videoUrl)}
                                      width="100%"
                                      height="180"
                                      style={{ border: 'none', borderRadius: 6 }}
                                      allowFullScreen
                                      title="Preview"
                                    />
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                  <button
                                    onClick={() => handleCreateLesson(a.id, mod.id)}
                                    disabled={saving}
                                    style={{
                                      ...btnPrimary(PURPLE),
                                      fontSize: 10,
                                      padding: '5px 10px',
                                    }}
                                  >
                                    {saving ? 'Salvando...' : 'Adicionar'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCreatingLesson(null);
                                      setNewLesson({ name: '', description: '', videoUrl: '' });
                                    }}
                                    style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setCreatingLesson(mod.id);
                                setNewLesson({ name: '', description: '', videoUrl: '' });
                              }}
                              style={{
                                ...iconBtn,
                                color: PURPLE,
                                fontFamily: SORA,
                                fontSize: 11,
                                gap: 4,
                                marginLeft: 16,
                                marginTop: 6,
                              }}
                            >
                              {IC.plus(14)} <span>Adicionar aula</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div
                      style={{ fontFamily: MONO, fontSize: 11, color: '#3A3A3F', marginBottom: 10 }}
                    >
                      Nenhum modulo nesta area.
                    </div>
                  )}

                  {/* Add module */}
                  {creatingModule === a.id ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 12,
                        background: BG_ELEVATED,
                        borderRadius: 6,
                        border: `1px solid ${BORDER}`,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: SORA,
                          fontSize: 10,
                          color: '#3A3A3F',
                          letterSpacing: '0.15em',
                          textTransform: 'uppercase' as const,
                          marginBottom: 8,
                        }}
                      >
                        Novo Modulo
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          aria-label="Nome do modulo"
                          value={newModule.name}
                          onChange={(e) => setNewModule({ name: e.target.value })}
                          placeholder="Nome do modulo"
                          style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleCreateModule(a.id)}
                          disabled={saving}
                          style={{ ...btnPrimary(PURPLE), fontSize: 10, padding: '5px 10px' }}
                        >
                          {saving ? 'Salvando...' : 'Criar'}
                        </button>
                        <button
                          onClick={() => {
                            setCreatingModule(null);
                            setNewModule({ name: '' });
                          }}
                          style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setCreatingModule(a.id);
                        setNewModule({ name: '' });
                      }}
                      style={{
                        ...iconBtn,
                        color: PURPLE,
                        fontFamily: SORA,
                        fontSize: 11,
                        gap: 4,
                        marginTop: 8,
                      }}
                    >
                      {IC.plus(14)} <span>Adicionar modulo</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live Feed */}
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            fontWeight: 600,
            color: '#3A3A3F',
            marginBottom: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
          }}
        >
          Atividade Recente
        </div>
        <LiveFeed color={PURPLE} events={memberEvents} />
      </div>

      {/* ── Student Enrollment Drawer ── */}
      {studentAreaId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 200,
            display: 'flex',
            justifyContent: 'flex-end',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => {
            setStudentAreaId(null);
            setEditingStudentId(null);
          }}
        >
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{
              width: 480,
              background: '#0A0A0C',
              borderLeft: `1px solid ${BORDER}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column' as const,
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${BORDER}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>
                  Alunos
                </div>
                <div style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>
                  {studentAreaName}
                </div>
              </div>
              <button
                aria-label="Fechar painel de alunos"
                onClick={() => {
                  setStudentAreaId(null);
                  setEditingStudentId(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#3A3A3F',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div
              style={{
                padding: '12px 20px',
                borderBottom: `1px solid ${BORDER}`,
                display: 'flex',
                gap: 8,
              }}
            >
              <input
                aria-label="Buscar aluno"
                value={studentSearch}
                onChange={(e) => handleSearchStudents(e.target.value)}
                placeholder="Buscar aluno..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => setShowAddStudent(!showAddStudent)}
                style={{
                  ...btnPrimary(PURPLE),
                  padding: '8px 14px',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {showAddStudent ? 'Cancelar' : '+ Aluno'}
              </button>
            </div>
            {showAddStudent && (
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: `1px solid ${BORDER}`,
                  display: 'flex',
                  flexDirection: 'column' as const,
                  gap: 8,
                }}
              >
                <input
                  aria-label="Nome do aluno"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Nome do aluno *"
                  style={inputStyle}
                />
                <input
                  aria-label="Email do aluno"
                  value={newStudent.email}
                  onChange={(e) => setNewStudent((s) => ({ ...s, email: e.target.value }))}
                  placeholder="Email *"
                  type="email"
                  style={inputStyle}
                />
                <input
                  aria-label="Telefone do aluno"
                  value={newStudent.phone}
                  onChange={(e) => setNewStudent((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="Telefone (opcional)"
                  style={inputStyle}
                />
                <button
                  onClick={handleAddStudent}
                  disabled={saving || !newStudent.name || !newStudent.email}
                  style={{
                    ...btnPrimary(PURPLE),
                    opacity: saving || !newStudent.name || !newStudent.email ? 0.5 : 1,
                  }}
                >
                  {saving ? 'Salvando...' : 'Matricular aluno'}
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto' as const, padding: '0 20px' }}>
              {studentLoading ? (
                <div
                  style={{
                    padding: '18px 0',
                    display: 'flex',
                    flexDirection: 'column' as const,
                    gap: 12,
                  }}
                >
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: `1px solid ${BG_ELEVATED}`,
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: '#19191C',
                          border: `1px solid ${BORDER}`,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            width: `${58 - index * 8}%`,
                            height: 12,
                            borderRadius: 6,
                            marginBottom: 8,
                            background:
                              'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
                          }}
                        />
                        <div
                          style={{
                            width: `${72 - index * 10}%`,
                            height: 10,
                            borderRadius: 6,
                            background:
                              'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : students.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' as const }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#E85D30',
                      letterSpacing: '.25em',
                      textTransform: 'uppercase' as const,
                      marginBottom: 8,
                    }}
                  >
                    SEM ALUNOS
                  </div>
                  <div style={{ fontSize: 14, color: '#E0DDD8', fontFamily: SORA }}>
                    Nenhum aluno matriculado
                  </div>
                  <div style={{ fontSize: 12, color: '#3A3A3F', fontFamily: SORA, marginTop: 4 }}>
                    Clique em &quot;+ Aluno&quot; para adicionar
                  </div>
                </div>
              ) : (
                students.map((s: any) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 0',
                      borderBottom: `1px solid ${BG_ELEVATED}`,
                    }}
                  >
                    {editingStudentId === s.id ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <input
                            aria-label="Nome do aluno"
                            value={editStudentData.name}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, name: e.target.value }))
                            }
                            style={inputStyle}
                          />
                          <input
                            aria-label="Email do aluno"
                            value={editStudentData.email}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, email: e.target.value }))
                            }
                            style={inputStyle}
                          />
                        </div>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px', gap: 8 }}
                        >
                          <input
                            aria-label="Telefone do aluno"
                            value={editStudentData.phone}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            style={inputStyle}
                            placeholder="Telefone"
                          />
                          <select
                            aria-label="Status do aluno"
                            value={editStudentData.status}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, status: e.target.value }))
                            }
                            style={selectStyle}
                          >
                            <option value="active">Ativo</option>
                            <option value="suspended">Suspenso</option>
                          </select>
                          <input
                            aria-label="Progresso do aluno"
                            type="number"
                            min="0"
                            max="100"
                            value={editStudentData.progress}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, progress: e.target.value }))
                            }
                            style={inputStyle}
                            placeholder="0-100"
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={handleUpdateStudent}
                            disabled={saving}
                            style={{
                              ...btnPrimary(PURPLE),
                              padding: '8px 12px',
                              opacity: saving ? 0.6 : 1,
                            }}
                          >
                            Salvar aluno
                          </button>
                          <button
                            onClick={() => setEditingStudentId(null)}
                            style={{ ...btnGhost, padding: '8px 12px' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: BG_ELEVATED,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#E85D30',
                            fontFamily: SORA,
                            flexShrink: 0,
                          }}
                        >
                          {(s.studentName || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: '#E0DDD8',
                              fontFamily: SORA,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' as const,
                            }}
                          >
                            {s.studentName}
                          </div>
                          <div style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>
                            {s.studentEmail}
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                            {s.studentPhone ? (
                              <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: MONO }}>
                                {s.studentPhone}
                              </span>
                            ) : null}
                            <span style={{ fontSize: 10, color: PURPLE, fontFamily: MONO }}>
                              {Math.round(Number(s.progress || 0))}% progresso
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: s.status === 'active' ? '#10B981' : '#EF4444',
                            }}
                          />
                          <span
                            style={{
                              fontSize: 10,
                              color: s.status === 'active' ? '#10B981' : '#EF4444',
                              fontFamily: SORA,
                            }}
                          >
                            {s.status === 'active' ? 'Ativo' : 'Suspenso'}
                          </span>
                        </div>
                        <button
                          aria-label="Editar aluno"
                          onClick={() => handleStartEditStudent(s)}
                          disabled={saving}
                          style={{ ...iconBtn, color: '#6E6E73' }}
                          title="Editar aluno"
                        >
                          {IC.edit(14)}
                        </button>
                        <button
                          aria-label={s.status === 'active' ? 'Suspender aluno' : 'Reativar aluno'}
                          onClick={() => handleToggleStudentStatus(s)}
                          disabled={saving}
                          style={{
                            ...iconBtn,
                            color: s.status === 'active' ? '#F59E0B' : '#10B981',
                          }}
                          title={s.status === 'active' ? 'Suspender aluno' : 'Reativar aluno'}
                        >
                          {s.status === 'active' ? IC.chevDown(14) : IC.trend(14)}
                        </button>
                        <button
                          aria-label="Remover aluno"
                          onClick={() => handleRemoveStudent(s.id)}
                          disabled={saving}
                          style={{ ...iconBtn, color: '#EF4444' }}
                          title="Remover aluno"
                        >
                          <svg
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════
// TAB: Afiliar-se (green)
// ═════════════════════════════════
function AfiliarSe({
  marketplace,
  earnings,
  marketplaceStats,
  affiliateLinks,
  affiliateProducts,
  onRefresh,
}: {
  marketplace: any[];
  earnings: number;
  marketplaceStats?: any;
  affiliateLinks: any[];
  affiliateProducts: any[];
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [selectedMarketItem, setSelectedMarketItem] = useState<any>(null);
  const [copiedAffiliate, setCopiedAffiliate] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const categories = [...new Set(marketplace.map((m) => m.category).filter(Boolean))];
  const filteredMarket = marketplace.filter((m) => {
    const matchSearch =
      !search ||
      (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.category || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || m.category === catFilter;
    return matchSearch && matchCat;
  });
  const approvedLinks = affiliateLinks.filter((link: any) => link.active !== false);
  const savedProducts = affiliateProducts.filter(
    (item: any) => item.status === 'SAVED' || item.affiliateProduct?.isSaved,
  );

  const handleRequestAffiliation = async (productId: string) => {
    setRequestingId(productId);
    try {
      await affiliateApi.requestAffiliation(productId);
      await onRefresh();
    } catch (error) {
      console.error(error);
    } finally {
      setRequestingId(null);
    }
  };

  const handleToggleSave = async (productId: string, isSaved: boolean) => {
    setSavingId(productId);
    try {
      if (isSaved) {
        await affiliateApi.unsaveProduct(productId);
      } else {
        await affiliateApi.saveProduct(productId);
      }
      await onRefresh();
    } catch (error) {
      console.error(error);
    } finally {
      setSavingId(null);
    }
  };

  // ── DETAIL VIEW ──
  if (selectedMarketItem) {
    const item = selectedMarketItem;
    const commissionPerSale = ((item.price || 0) * (item.commission || 0)) / 100;
    const projected30 = commissionPerSale * 15;
    const projected90 = commissionPerSale * 50;

    return (
      <div style={{ opacity: 1 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setSelectedMarketItem(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              color: GREEN,
              fontFamily: SORA,
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            &larr; Marketplace
          </button>
          <span style={{ color: '#3A3A3F' }}>/</span>
          <span style={{ fontFamily: SORA, fontSize: 13, color: '#E0DDD8' }}>{item.name}</span>
        </div>

        {/* Commission Hero 48px */}
        <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 200,
              height: 80,
              borderRadius: '50%',
              background: `radial-gradient(ellipse, ${GREEN}40, transparent 70%)`,
              animation: 'glow 3s ease-in-out',
              pointerEvents: 'none',
            }}
          />
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: '#3A3A3F',
                letterSpacing: '0.25em',
                textTransform: 'uppercase' as const,
                marginBottom: 4,
              }}
            >
              Comissao
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 48,
                fontWeight: 700,
                color: GREEN,
                letterSpacing: '-0.02em',
              }}
            >
              {item.commission}%
            </div>
            <div style={{ fontFamily: MONO, fontSize: 14, color: '#E0DDD8', marginTop: 4 }}>
              {fmtBRL(commissionPerSale)} por venda
            </div>
          </div>
        </div>

        {/* Item Header */}
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 24,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 12,
                overflow: 'hidden',
                background: BG_ELEVATED,
                border: `1px solid ${BORDER}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {item.thumbnailUrl || item.imageUrl ? (
                <img
                  src={item.thumbnailUrl || item.imageUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: GREEN }}>{IC.box(28)}</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SORA, fontSize: 20, fontWeight: 700, color: '#E0DDD8' }}>
                {item.name}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: '#6E6E73', marginTop: 4 }}>
                por {item.producer} &middot; {item.category}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
            {[
              { label: 'Preco', value: fmtBRL(item.price || 0) },
              { label: 'Comissao', value: `${item.commission || 0}%` },
              { label: 'Vendas', value: fmt(item.sales || 0) },
              { label: 'Avaliacao', value: `${item.rating || 0}/5` },
              { label: 'Temperatura', value: `${item.temperature || 0}` },
            ].map((d, i) => (
              <div key={i}>
                <div
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: '#3A3A3F',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  {d.label}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#E0DDD8',
                    marginTop: 2,
                  }}
                >
                  {d.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Description */}
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: '#E0DDD8',
              marginBottom: 8,
            }}
          >
            Descricao
          </div>
          <div style={{ fontFamily: SORA, fontSize: 13, color: '#6E6E73', lineHeight: 1.7 }}>
            {item.description || 'Sem descricao disponivel.'}
          </div>
        </div>

        {/* Commission Simulator Projections */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 20,
              borderLeft: `3px solid ${GREEN}`,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 10,
                color: '#3A3A3F',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.25em',
              }}
            >
              Projecao 30 dias
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 28,
                fontWeight: 700,
                color: GREEN,
                marginTop: 8,
              }}
            >
              {fmtBRL(projected30)}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73', marginTop: 4 }}>
              ~15 vendas estimadas
            </div>
          </div>
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 20,
              borderLeft: `3px solid ${GREEN}`,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 10,
                color: '#3A3A3F',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.25em',
              }}
            >
              Projecao 90 dias
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 28,
                fontWeight: 700,
                color: GREEN,
                marginTop: 8,
              }}
            >
              {fmtBRL(projected90)}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73', marginTop: 4 }}>
              ~50 vendas estimadas
            </div>
          </div>
        </div>

        {/* Materials */}
        {item.materials && item.materials.length > 0 && (
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                color: '#E0DDD8',
                marginBottom: 12,
              }}
            >
              Materiais de Divulgacao
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {item.materials.map((mat: string, i: number) => (
                <span
                  key={i}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    padding: '6px 12px',
                    background: `${GREEN}15`,
                    color: GREEN,
                    borderRadius: 6,
                    border: `1px solid ${GREEN}30`,
                  }}
                >
                  {mat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Affiliate Link */}
        {item.affiliateLink && (
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                color: '#E0DDD8',
                marginBottom: 12,
              }}
            >
              Seu Link de Afiliado
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div
                style={{
                  flex: 1,
                  fontFamily: MONO,
                  fontSize: 13,
                  color: GREEN,
                  padding: '10px 14px',
                  background: `${GREEN}10`,
                  borderRadius: 6,
                  border: `1px solid ${GREEN}30`,
                }}
              >
                {item.affiliateLink}
              </div>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(item.affiliateLink).then(() => {
                    setCopiedAffiliate(true);
                    if (copiedTimer.current) clearTimeout(copiedTimer.current);
                    copiedTimer.current = setTimeout(() => setCopiedAffiliate(false), 2000);
                  })
                }
                style={{
                  padding: '10px 16px',
                  background: GREEN,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontFamily: SORA,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {copiedAffiliate ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        {/* AI Analysis */}
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 20,
            borderLeft: `3px solid ${GREEN}`,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: GREEN }}>{IC.zap(16)}</span>
            <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>
              Analise IA
            </span>
            <NP w={40} h={14} color={GREEN} />
          </div>
          <div style={{ fontFamily: SORA, fontSize: 12, color: '#6E6E73', lineHeight: 1.6 }}>
            Este produto tem alta taxa de conversao ({item.rating || 0}/5) e comissao de{' '}
            {item.commission || 0}%. Com base no seu publico, estimamos ganhos de{' '}
            {fmtBRL(projected30)} nos primeiros 30 dias. Recomendacao: usar trafego organico no
            Instagram com copy focada em transformacao.
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          {item.affiliateLink ? (
            <button
              onClick={() =>
                navigator.clipboard.writeText(item.affiliateLink).then(() => {
                  setCopiedAffiliate(true);
                  if (copiedTimer.current) clearTimeout(copiedTimer.current);
                  copiedTimer.current = setTimeout(() => setCopiedAffiliate(false), 2000);
                })
              }
              style={{
                padding: '14px 40px',
                background: GREEN,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontFamily: SORA,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: `0 0 30px ${GREEN}40`,
              }}
            >
              {copiedAffiliate ? 'Link copiado' : 'Copiar link de afiliado'}
            </button>
          ) : (
            <button
              onClick={() => handleRequestAffiliation(item.id)}
              disabled={requestingId === item.id || item.requestStatus === 'PENDING'}
              style={{
                padding: '14px 40px',
                background: item.requestStatus === 'PENDING' ? BG_ELEVATED : GREEN,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontFamily: SORA,
                fontSize: 15,
                fontWeight: 700,
                cursor: item.requestStatus === 'PENDING' ? 'default' : 'pointer',
                boxShadow: item.requestStatus === 'PENDING' ? 'none' : `0 0 30px ${GREEN}40`,
              }}
            >
              {requestingId === item.id
                ? 'Enviando...'
                : item.requestStatus === 'PENDING'
                  ? 'Solicitacao enviada'
                  : 'Solicitar afiliacao'}
            </button>
          )}
        </div>

        {/* Performance snapshot */}
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 20,
          }}
        >
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: '#E0DDD8',
              marginBottom: 16,
            }}
          >
            Snapshot operacional
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              {
                label: 'Aprovacao',
                value:
                  item.requestStatus === 'APPROVED'
                    ? 'Ativa'
                    : item.requestStatus === 'PENDING'
                      ? 'Pendente'
                      : 'Nao iniciada',
              },
              { label: 'Cookie', value: `${item.cookieDays || 30} dias` },
              { label: 'Afiliados', value: String(item.totalAffiliates || 0) },
              { label: 'Reviews', value: `${item.totalReviews || 0}` },
            ].map((metric) => (
              <div
                key={metric.label}
                style={{ padding: '12px 14px', background: BG_ELEVATED, borderRadius: 6 }}
              >
                <div style={{ fontFamily: SORA, fontSize: 10, color: '#3A3A3F', marginBottom: 4 }}>
                  {metric.label}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: '#E0DDD8' }}>
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN AFILIAR-SE VIEW ──
  return (
    <div style={{ opacity: 1 }}>
      {/* Earnings Hero -- 80px green glow */}
      <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 200,
            height: 80,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${GREEN}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out',
            pointerEvents: 'none',
          }}
        />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: '#3A3A3F',
              letterSpacing: '0.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 4,
            }}
          >
            Ganhos Totais
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 80,
              fontWeight: 700,
              color: GREEN,
              letterSpacing: '-0.02em',
            }}
          >
            {fmtBRL(earnings)}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 8,
            }}
          >
            <NP w={40} h={14} color={GREEN} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: GREEN }}>
              {earnings > 0 ? `+${fmtBRL(earnings)} acumulado` : 'Sem ganhos ainda'}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#6E6E73',
          }}
        >
          {IC.search(16)}
        </span>
        <input
          aria-label="Buscar produtos para se afiliar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produtos para se afiliar..."
          style={{
            width: '100%',
            padding: '10px 14px 10px 36px',
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: '#E0DDD8',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box' as const,
          }}
        />
      </div>

      {/* Category Chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setCatFilter(null)}
          style={{
            padding: '6px 14px',
            borderRadius: 99,
            border: 'none',
            cursor: 'pointer',
            fontFamily: SORA,
            fontSize: 11,
            fontWeight: 600,
            background: !catFilter ? GREEN : BG_ELEVATED,
            color: !catFilter ? '#fff' : '#6E6E73',
          }}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? null : cat)}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              border: 'none',
              cursor: 'pointer',
              fontFamily: SORA,
              fontSize: 11,
              fontWeight: 600,
              background: catFilter === cat ? GREEN : BG_ELEVATED,
              color: catFilter === cat ? '#fff' : '#6E6E73',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Marketplace stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          {
            icon: IC.box,
            label: 'Ganhos',
            value: fmtBRL(earnings),
            sub: approvedLinks.length > 0 ? `${approvedLinks.length} links ativos` : 'sem ganhos',
          },
          {
            icon: IC.trend,
            label: 'Marketplace',
            value: String(marketplaceStats?.totalProducts || marketplace.length),
            sub: 'produtos disponiveis',
          },
          {
            icon: IC.heart,
            label: 'Solicitacoes',
            value: String(affiliateProducts.length),
            sub: `${savedProducts.length} salvos`,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: GREEN }}>{s.icon(18)}</span>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#3A3A3F',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: '#E0DDD8' }}>
              {s.value}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: GREEN, marginTop: 4 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Marketplace nerve fibers */}
      {(approvedLinks.length > 0 || savedProducts.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                color: '#E0DDD8',
                marginBottom: 10,
              }}
            >
              Meus links ativos
            </div>
            {approvedLinks.slice(0, 3).map((link: any) => (
              <div
                key={link.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: `1px solid ${BG_ELEVATED}`,
                }}
              >
                <div>
                  <div style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8' }}>
                    {link.affiliateProduct?.name || 'Produto'}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73' }}>
                    {link.clicks || 0} cliques · {link.sales || 0} vendas
                  </div>
                </div>
                <button
                  onClick={() =>
                    navigator.clipboard
                      .writeText(link.url || link.affiliateProduct?.affiliateLink || '')
                      .catch(() => {})
                  }
                  style={{ ...btnGhost, padding: '6px 10px' }}
                >
                  Copiar
                </button>
              </div>
            ))}
          </div>
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div
              style={{
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                color: '#E0DDD8',
                marginBottom: 10,
              }}
            >
              Produtos salvos
            </div>
            {savedProducts.length > 0 ? (
              savedProducts.slice(0, 3).map((item: any) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: `1px solid ${BG_ELEVATED}`,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: SORA, fontSize: 12, color: '#E0DDD8' }}>
                      {item.affiliateProduct?.name || 'Produto salvo'}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73' }}>
                      {item.status || 'SAVED'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleSave(item.affiliateProductId || item.id, true)}
                    style={{ ...btnGhost, padding: '6px 10px' }}
                  >
                    Remover
                  </button>
                </div>
              ))
            ) : (
              <div style={{ fontFamily: SORA, fontSize: 12, color: '#6E6E73' }}>
                Salve produtos do marketplace para analisar depois.
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          fontWeight: 600,
          color: '#3A3A3F',
          marginBottom: 10,
          letterSpacing: '0.25em',
          textTransform: 'uppercase' as const,
        }}
      >
        Marketplace ({filteredMarket.length} produtos)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredMarket.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ color: GREEN, display: 'block', marginBottom: 12 }}>{IC.store(32)}</span>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 14,
                fontWeight: 600,
                color: '#E0DDD8',
                marginBottom: 6,
              }}
            >
              Nenhum produto disponivel no marketplace.
            </div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: '#6E6E73' }}>
              Novos produtos serao exibidos aqui quando estiverem disponiveis.
            </div>
          </div>
        )}
        {filteredMarket.map((m) => (
          <div
            key={m.id}
            onClick={() => setSelectedMarketItem(m)}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px 14px 20px',
              background: BG_CARD,
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              cursor: 'pointer',
              transition: 'border-color 150ms ease',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: GREEN,
              }}
            />
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                background: BG_ELEVATED,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {m.thumbnailUrl || m.imageUrl ? (
                <img
                  src={m.thumbnailUrl || m.imageUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                />
              ) : (
                <span style={{ color: GREEN }}>{IC.box(20)}</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: SORA, fontSize: 13, fontWeight: 600, color: '#E0DDD8' }}>
                  {m.name}
                </span>
                {(m.temperature || 0) >= 90 && <span>{IC.fire(12)}</span>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: '#3A3A3F', marginTop: 2 }}>
                {m.category} &middot; por {m.producer}
              </div>
            </div>
            <NP w={100} h={24} color={GREEN} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: GREEN }}>
                {m.commission || 0}%
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: '#6E6E73', marginTop: 2 }}>
                {fmtBRL(m.price || 0)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#E85D30' }}>{IC.star(12)}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73' }}>
                {m.rating || 0}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSave(m.id, !!m.isSaved);
              }}
              style={{
                ...iconBtn,
                color: m.isSaved ? GREEN : '#6E6E73',
              }}
              title={m.isSaved ? 'Remover dos salvos' : 'Salvar produto'}
            >
              {IC.heart(14)}
            </button>
            <span style={{ color: '#3A3A3F', fontFamily: SORA, fontSize: 16 }}>&rsaquo;</span>
          </div>
        ))}
      </div>

      {/* Live Feed */}
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            fontWeight: 600,
            color: '#3A3A3F',
            marginBottom: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
          }}
        >
          Vendas Recentes
        </div>
        <LiveFeed
          color={GREEN}
          events={
            approvedLinks.length > 0
              ? approvedLinks.slice(0, 4).map((link: any) => ({
                  text: `${link.affiliateProduct?.name || 'Produto'} com ${link.clicks || 0} cliques e ${link.sales || 0} vendas.`,
                  time: timeAgo(link.createdAt),
                }))
              : [{ text: 'Aguardando atividade de afiliados...', time: '' }]
          }
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════
export default function ProdutosView({ defaultTab = 'produtos' }: { defaultTab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const requestedFeature = searchParams?.get('feature') || '';

  // ── Real data hooks ──
  const { products: rawProducts, mutate: mutateProducts } = useProducts();
  const { areas: rawAreas, mutate: mutateAreas } = useMemberAreas();
  const { deleteProduct } = useProductMutations();

  // ── Affiliate data ──
  const [marketplace, setMarketplace] = useState<any[]>([]);
  const [marketplaceStats, setMarketplaceStats] = useState<any>({});
  const [affiliateLinks, setAffiliateLinks] = useState<any[]>([]);
  const [affiliateTotals, setAffiliateTotals] = useState<any>({
    clicks: 0,
    sales: 0,
    revenue: 0,
    commission: 0,
  });
  const [affiliateProducts, setAffiliateProducts] = useState<any[]>([]);

  const hydrateAffiliate = useCallback(async () => {
    try {
      const [marketplaceResponse, statsResponse, linksResponse, productsResponse] =
        await Promise.all([
          affiliateApi.marketplace(),
          affiliateApi.marketplaceStats(),
          affiliateApi.myLinks(),
          affiliateApi.myProducts(),
        ]);

      setMarketplace(
        Array.isArray((marketplaceResponse as any)?.data?.products)
          ? (marketplaceResponse as any).data.products
          : Array.isArray((marketplaceResponse as any)?.products)
            ? (marketplaceResponse as any).products
            : [],
      );
      setMarketplaceStats((statsResponse as any)?.data || statsResponse || {});
      setAffiliateLinks(
        Array.isArray((linksResponse as any)?.data?.links)
          ? (linksResponse as any).data.links
          : Array.isArray((linksResponse as any)?.links)
            ? (linksResponse as any).links
            : [],
      );
      setAffiliateTotals(
        (linksResponse as any)?.data?.totals ||
          (linksResponse as any)?.totals || { clicks: 0, sales: 0, revenue: 0, commission: 0 },
      );
      setAffiliateProducts(
        Array.isArray((productsResponse as any)?.data?.products)
          ? (productsResponse as any).data.products
          : Array.isArray((productsResponse as any)?.products)
            ? (productsResponse as any).products
            : [],
      );
    } catch {
      setMarketplace([]);
      setMarketplaceStats({});
      setAffiliateLinks([]);
      setAffiliateTotals({ clicks: 0, sales: 0, revenue: 0, commission: 0 });
      setAffiliateProducts([]);
    }
  }, []);

  useEffect(() => {
    void hydrateAffiliate();
  }, [hydrateAffiliate]);

  // ── Normalize products ──
  const displayProducts = Array.isArray(rawProducts)
    ? (rawProducts as any[])
        .filter((p: any) => !isLegacyProductName(p?.name))
        .map((p: any) => {
          const backendStatus = String(p.status || '').toUpperCase();
          const status =
            backendStatus === 'APPROVED' || (!backendStatus && p.active !== false)
              ? 'active'
              : backendStatus === 'PENDING'
                ? 'pending'
                : 'draft';

          return {
            id: p.id,
            name: p.name,
            price: p.price || 0,
            sales: p.totalSales || p.sales || 0,
            revenue: p.totalRevenue || p.revenue || 0,
            students: p.studentsCount || p.students || 0,
            category: p.category || 'Digital',
            status,
            color: '#8B5CF6',
            format: p.format || '',
            active: status === 'active',
            imageUrl: p.imageUrl || p.thumbnailUrl || '',
            activePlansCount: p.activePlansCount || 0,
            memberAreasCount: p.memberAreasCount || 0,
            affiliateCount: p.affiliateCount || 0,
            createdAt: p.createdAt || '',
            updatedAt: p.updatedAt || '',
          };
        })
    : [];

  // ── Normalize areas ──
  const displayAreas = Array.isArray(rawAreas)
    ? (rawAreas as any[]).map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type || 'COURSE',
        description: a.description || '',
        students: a.studentsCount || a.totalStudents || a.students || 0,
        modules: a.modulesCount || a.totalModules || a.modules || 0,
        modulesCount: a.modulesCount || a.totalModules || a.modules || 0,
        lessonsCount: a.lessonsCount || a.totalLessons || 0,
        completion: a.avgCompletion || a.completion || 0,
        status: a.status || 'active',
        active: a.active !== false,
        productId: a.productId || '',
        productName: displayProducts.find((product: any) => product.id === a.productId)?.name || '',
        slug: a.slug || '',
        template: a.template || 'academy',
        primaryColor: a.primaryColor || PURPLE,
        logoUrl: a.logoUrl || '',
        coverUrl: a.coverUrl || '',
        certificates: a.certificates !== false,
        quizzes: a.quizzes !== false,
        community: a.community === true,
        gamification: a.gamification !== false,
        progressTrack: a.progressTrack !== false,
        downloads: a.downloads !== false,
        comments: a.comments !== false,
        createdAt: a.createdAt || '',
        updatedAt: a.updatedAt || '',
        modules_list: a.modules_list || a.modulesList || a.Modules || [],
      }))
    : [];

  // ── Derived stats ──
  const totalRevenue = displayProducts.reduce(
    (s: number, p: any) => s + (p.revenue || p.price * (p.sales || 0)),
    0,
  );
  const totalSales = displayProducts.reduce((s: number, p: any) => s + (p.sales || 0), 0);
  const activeProducts = displayProducts.filter((p: any) => p.status === 'active').length;
  const totalStudents = displayAreas.reduce((s: number, a: any) => s + (a.students || 0), 0);
  const areasWithCompletion = displayAreas.filter((a: any) => a.completion > 0);
  const avgCompletion =
    areasWithCompletion.length > 0
      ? Math.round(
          areasWithCompletion.reduce((s: number, a: any) => s + a.completion, 0) /
            areasWithCompletion.length,
        )
      : 0;
  const earnings = Number(affiliateTotals.commission || 0);

  // ── Product deletion ──
  const handleDeleteProduct = useCallback(
    async (id: string) => {
      try {
        await deleteProduct(id);
        mutateProducts();
      } catch (e) {
        console.error(e);
      }
    },
    [deleteProduct, mutateProducts],
  );

  // ── Tab navigation ──
  const handleTabChange = useCallback(
    (key: string) => {
      setActiveTab(key);
      const tab = TABS.find((t) => t.key === key);
      if (!tab || pathname === tab.route) return;
      startTransition(() => {
        router.push(tab.route);
      });
    },
    [pathname, router],
  );

  const buildFeatureHref = useCallback((productId: string, feature: string) => {
    switch (feature) {
      case 'recommendation':
        return `/products/${productId}?tab=campanhas&focus=recommendations`;
      case 'order-bump':
        return `/products/${productId}?tab=planos&planSub=bump&focus=order-bump`;
      case 'coupon':
        return `/products/${productId}?tab=cupons&modal=newCoupon&focus=coupon`;
      case 'coproduction':
        return `/products/${productId}?tab=comissao&comSub=coprod&focus=coproduction`;
      case 'checkout-appearance':
        return `/products/${productId}?tab=checkouts&focus=checkout-appearance`;
      case 'payment-widget':
        return `/products/${productId}?tab=checkouts&focus=payment-widget`;
      case 'urgency':
        return `/products/${productId}?tab=ia&focus=urgency`;
      default:
        return `/products/${productId}`;
    }
  }, []);

  useEffect(() => {
    if (!requestedFeature || activeTab !== 'produtos' || displayProducts.length === 0) return;
    router.replace(buildFeatureHref(displayProducts[0].id, requestedFeature));
  }, [requestedFeature, activeTab, displayProducts, router, buildFeatureHref]);

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0C', color: '#E0DDD8', fontFamily: SORA }}>
      <style>{ANIMATIONS}</style>

      {/* Page container */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        {/* Tab Navigation — pill style (same pattern as Marketing) */}
        <div
          style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', paddingBottom: 8 }}
        >
          {TABS.filter((t) => t.key !== 'membros').map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={{
                  fontFamily: SORA,
                  fontSize: 12,
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: isActive ? `${tab.color}20` : 'transparent',
                  color: isActive ? tab.color : '#6E6E73',
                  transition: 'all .2s',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'produtos' && (
          <MeusProdutos
            displayProducts={displayProducts}
            totalRevenue={totalRevenue}
            totalSales={totalSales}
            activeProducts={activeProducts}
            onDeleteProduct={handleDeleteProduct}
            onCreateProduct={() => router.push('/products/new')}
            onOpenFeature={(productId, feature) =>
              router.push(buildFeatureHref(productId, feature))
            }
            requestedFeature={requestedFeature}
          />
        )}
        {activeTab === 'membros' && (
          <AreaMembros
            totalStudents={totalStudents}
            displayAreas={displayAreas}
            avgCompletion={avgCompletion}
            mutateAreas={mutateAreas}
            productOptions={displayProducts}
          />
        )}
        {activeTab === 'afiliar' && (
          <AfiliarSe
            marketplace={marketplace}
            earnings={earnings}
            marketplaceStats={marketplaceStats}
            affiliateLinks={affiliateLinks}
            affiliateProducts={affiliateProducts}
            onRefresh={hydrateAffiliate}
          />
        )}
      </div>
    </div>
  );
}
