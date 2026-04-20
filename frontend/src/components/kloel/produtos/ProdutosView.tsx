'use client';

import { kloelT } from '@/lib/i18n/t';
import { IconActionButton } from '@/components/kloel/products/product-nerve-center.shared';
import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useMemberAreaMutations, useMemberAreas } from '@/hooks/useMemberAreas';
import { useProductMutations, useProducts } from '@/hooks/useProducts';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { apiFetch } from '@/lib/api';
import { affiliateApi } from '@/lib/api/misc';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { buildMemberAreaPreviewPath } from '@/lib/member-area-preview';
import { toSupportedEmbedUrl } from '@/lib/video-embed';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type React from 'react';
import { startTransition, useCallback, useEffect, useRef, useState, useId } from 'react';
import { mutate } from 'swr';

// ── Fonts ──
const SORA = "'Sora',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// ── DNA Colors ──
const _BG = KLOEL_THEME.bgPrimary;
const BG_CARD = KLOEL_THEME.bgCard;
const BG_ELEVATED = KLOEL_THEME.bgSecondary;
const BORDER = KLOEL_THEME.borderPrimary;
const EMBER = KLOEL_THEME.accent;
const _TEXT = KLOEL_THEME.textPrimary;
const _TEXT_DIM = KLOEL_THEME.textSecondary;
const _TEXT_MUTED = KLOEL_THEME.textTertiary;
const PURPLE = '#8B5CF6';
const GREEN = EMBER;

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mediaQuery.matches);

    apply();
    mediaQuery.addEventListener?.('change', apply);
    return () => mediaQuery.removeEventListener?.('change', apply);
  }, []);

  return prefersReducedMotion;
}

// ── Icons (IC) ──
// Extracted into a sibling module to keep this file focused on layout/logic.
import { IC } from './ProdutosView.icons';
import { normalizeDisplayProduct } from './ProdutosView.helpers';

// ── NeuralPulse (NP) — canvas 2D with sin() waves ──
function NP({ w = 160, h = 28, color = '#E85D30' }: { w?: number; h?: number; color?: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);

  const staticWave = Array.from({ length: Math.max(2, Math.floor(w / 2)) }, (_, index) => {
    const x = (index / (Math.max(2, Math.floor(w / 2)) - 1)) * w;
    const amplitude = h * 0.18;
    const y = h / 2 + Math.sin(index * 0.55) * amplitude;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    const c = ref.current;
    if (!c) {
      return;
    }
    const ctx = c.getContext('2d');
    if (!ctx) {
      return;
    }
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
      if (!visible) {
        return;
      }
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
  }, [w, h, color, prefersReducedMotion]);

  if (prefersReducedMotion) {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden="true"
        style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }}
      >
        <polyline
          points={staticWave}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

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
  const prefersReducedMotion = usePrefersReducedMotion();
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
          animation: prefersReducedMotion ? 'none' : `tickerScroll ${duration} linear infinite`,
          fontFamily: MONO,
          fontSize: 11,
          color,
          opacity: 0.7,
          transform: prefersReducedMotion ? 'translateX(0)' : undefined,
        }}
      >
        {prefersReducedMotion ? text : `${text}\u00a0\u00a0\u00a0///\u00a0\u00a0\u00a0${text}`}
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
      {events.map((ev) => (
        <div
          key={`${ev.text}-${ev.time}`}
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
          <span
            style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)', flex: 1 }}
          >
            {ev.text}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)' }}>
            {ev.time}
          </span>
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
const fmtBRLCents = (n: number) => fmtBRL(n / 100);
const timeAgo = (value?: string | null) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}min`;
  }
  if (diffMinutes < 1440) {
    return `${Math.floor(diffMinutes / 60)}h`;
  }
  return `${Math.floor(diffMinutes / 1440)}d`;
};

// ── Local view models ──
// The raw shape returned by `useProducts` / `useMemberAreas` is `unknown[]`,
// but after normalisation (see ProdutosView main component) we shape it into
// these concrete records. All downstream components consume these shapes.

interface DisplayProduct {
  id: string;
  name: string;
  price: number;
  sales: number;
  revenue: number;
  students: number;
  category: string;
  status: 'active' | 'pending' | 'draft';
  color: string;
  format: string;
  active: boolean;
  imageUrl: string;
  plansCount: number;
  activePlansCount: number;
  minPlanPriceInCents: number | null;
  maxPlanPriceInCents: number | null;
  hasPlanPricing: boolean;
  priceLabel: string;
  memberAreasCount: number;
  affiliateCount: number;
  createdAt: string;
  updatedAt: string;
  // Optional fields only present on some normalisation paths
  totalSales?: number;
}

interface DisplayLesson {
  id: string;
  name: string;
  description?: string;
  videoUrl?: string;
}

interface DisplayModule {
  id: string;
  name: string;
  lessons?: DisplayLesson[];
}

interface DisplayArea {
  id: string;
  name: string;
  type: string;
  description: string;
  students: number;
  modules: number;
  modulesCount: number;
  lessonsCount: number;
  completion: number;
  status: string;
  active: boolean;
  productId: string;
  productName: string;
  slug: string;
  template: string;
  primaryColor: string;
  logoUrl: string;
  coverUrl: string;
  certificates: boolean;
  quizzes: boolean;
  community: boolean;
  gamification: boolean;
  progressTrack: boolean;
  downloads: boolean;
  comments: boolean;
  createdAt: string;
  updatedAt: string;
  modules_list: DisplayModule[];
  // Legacy alias sometimes present on the source payload
  modulesList?: DisplayModule[];
}

interface MemberAreaStudent {
  id: string;
  studentName?: string;
  studentEmail?: string;
  studentPhone?: string | null;
  status?: string;
  progress?: number | string;
}

interface MarketplaceItem {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  producer?: string;
  price?: number;
  commission?: number;
  sales?: number;
  rating?: number;
  temperature?: number;
  thumbnailUrl?: string;
  imageUrl?: string;
  isSaved?: boolean;
  materials?: string[];
  affiliateLink?: string;
  requestStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  cookieDays?: number;
  totalAffiliates?: number;
  totalReviews?: number;
}

interface MarketplaceStats {
  totalProducts?: number;
  topEarners?: number;
  avgCommission?: number;
  [key: string]: unknown;
}

interface AffiliateProductSummary {
  id?: string;
  name?: string;
  affiliateLink?: string;
  isSaved?: boolean;
}

interface AffiliateLink {
  id: string;
  url?: string;
  clicks?: number;
  sales?: number;
  active?: boolean;
  createdAt?: string;
  affiliateProduct?: AffiliateProductSummary;
}

interface AffiliateProductItem {
  id: string;
  status?: string;
  affiliateProductId?: string;
  affiliateProduct?: AffiliateProductSummary;
}

// Raw payload shapes coming from backend (pre-normalisation). We only
// declare the fields the normaliser actually reads.
interface RawProductPayload {
  id: string;
  name: string;
  price?: number;
  totalSales?: number;
  sales?: number;
  totalRevenue?: number;
  revenue?: number;
  studentsCount?: number;
  students?: number;
  category?: string;
  status?: string;
  active?: boolean;
  format?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  plansCount?: number;
  activePlansCount?: number;
  minPlanPriceInCents?: number | null;
  maxPlanPriceInCents?: number | null;
  memberAreasCount?: number;
  affiliateCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface RawAreaPayload {
  id: string;
  name: string;
  type?: string;
  description?: string;
  studentsCount?: number;
  totalStudents?: number;
  students?: number;
  modulesCount?: number;
  totalModules?: number;
  modules?: number;
  lessonsCount?: number;
  totalLessons?: number;
  avgCompletion?: number;
  completion?: number;
  status?: string;
  active?: boolean;
  productId?: string;
  slug?: string;
  template?: string;
  primaryColor?: string;
  logoUrl?: string;
  coverUrl?: string;
  certificates?: boolean;
  quizzes?: boolean;
  community?: boolean;
  gamification?: boolean;
  progressTrack?: boolean;
  downloads?: boolean;
  comments?: boolean;
  createdAt?: string;
  updatedAt?: string;
  modules_list?: DisplayModule[];
  modulesList?: DisplayModule[];
  Modules?: DisplayModule[];
}

function getProductPlanPriceSummary(product: {
  minPlanPriceInCents?: unknown;
  maxPlanPriceInCents?: unknown;
}) {
  const rawMin = Number(product.minPlanPriceInCents);
  const rawMax = Number(product.maxPlanPriceInCents);
  const hasMin = Number.isFinite(rawMin);
  const hasMax = Number.isFinite(rawMax);

  if (!hasMin || !hasMax) {
    return {
      hasPlanPricing: false,
      minPlanPriceInCents: null,
      maxPlanPriceInCents: null,
      priceLabel: 'Sem planos',
    };
  }

  const minPlanPriceInCents = Math.max(0, Math.round(Math.min(rawMin, rawMax)));
  const maxPlanPriceInCents = Math.max(0, Math.round(Math.max(rawMin, rawMax)));

  return {
    hasPlanPricing: true,
    minPlanPriceInCents,
    maxPlanPriceInCents,
    priceLabel:
      minPlanPriceInCents === maxPlanPriceInCents
        ? fmtBRLCents(minPlanPriceInCents)
        : `${fmtBRLCents(minPlanPriceInCents)} até ${fmtBRLCents(maxPlanPriceInCents)}`,
  };
}

// ── Style helpers ──
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: BG_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: 'var(--app-text-primary)',
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
  color: 'var(--app-text-secondary)',
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
  requestedFeature,
}: {
  displayProducts: DisplayProduct[];
  totalRevenue: number;
  totalSales: number;
  activeProducts: number;
  onDeleteProduct?: (id: string) => void;
  onCreateProduct?: () => void;
  requestedFeature?: string;
}) {
  const router = useRouter();
  const { isMobile } = useResponsiveViewport();
  const flashElRef = useRef<HTMLDivElement>(null);
  const revElRef = useRef<HTMLSpanElement>(null);
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
      ? displayProducts.slice(0, 4).map((product) => ({
          text:
            (product.totalSales ?? 0) > 0
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
  const maxRevenue = Math.max(...displayProducts.map((p) => p.revenue || 0), 1);

  return (
    <div style={{ opacity: 1 }}>
      {/* Revenue Hero + Novo Produto aligned */}
      <div
        style={{
          position: 'relative',
          padding: isMobile ? '8px 0 24px' : '32px 0',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: isMobile ? 150 : 200,
            height: isMobile ? 64 : 80,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${EMBER}40, transparent 70%)`,
            animation: 'glow 3s ease-in-out',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? 16 : 0,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {!isMobile && (
            <button
              type="button"
              onClick={onCreateProduct}
              style={{
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 20px',
                background: EMBER,
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                zIndex: 2,
                boxShadow: '0 18px 32px rgba(232,93,48,0.18)',
              }}
            >
              <span style={{ color: '#fff' }}>{IC.plus(16)}</span> {kloelT(`Novo produto`)}
            </button>
          )}
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: 'var(--app-text-tertiary)',
                letterSpacing: '0.25em',
                textTransform: 'uppercase' as const,
                marginBottom: 4,
              }}
            >
              {kloelT(`RECEITA TOTAL DOS SEUS PRODUTOS`)}
            </div>
            <div
              ref={flashElRef}
              style={{
                fontFamily: MONO,
                fontSize: isMobile ? 34 : 80,
                fontWeight: 700,
                color: EMBER,
                letterSpacing: '-0.02em',
                textShadow: '0 0 20px rgba(232,93,48,0.3)',
                transition: 'text-shadow .3s',
                lineHeight: 1,
                wordBreak: 'break-word',
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
              <span style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 12, color: EMBER }}>
                {activeProducts > 0
                  ? `${activeProducts}/${displayProducts.length} ativos`
                  : 'Ative seu primeiro produto'}
              </span>
            </div>
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={onCreateProduct}
              style={{
                width: '100%',
                maxWidth: 360,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 18px',
                background: EMBER,
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 18px 32px rgba(232,93,48,0.16)',
              }}
            >
              <span style={{ color: '#fff' }}>{IC.plus(16)}</span> {kloelT(`Novo produto`)}
            </button>
          )}
        </div>
      </div>

      {/* Sale Ticker 22s */}
      <Ticker
        items={
          displayProducts.length > 0
            ? displayProducts.map((p) =>
                p.hasPlanPricing
                  ? `${p.name} · ${p.priceLabel}`
                  : `${p.name} · sem planos configurados`,
              )
            : ['Aguardando vendas...']
        }
        color={EMBER}
        duration="22s"
      />

      {/* Product Nerve Fibers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 0' }}>
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
                color: 'var(--app-text-primary)',
                marginBottom: 6,
              }}
            >
              {kloelT(`Nenhum produto cadastrado.`)}
            </div>
            <div
              style={{
                fontFamily: SORA,
                fontSize: 13,
                color: 'var(--app-text-secondary)',
                marginBottom: 16,
              }}
            >
              {requestedFeature
                ? 'Crie seu primeiro produto para liberar esta configuracao operacional.'
                : 'Crie seu primeiro produto para comecar a vender.'}
            </div>
            <button
              type="button"
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
        {displayProducts.map((p) => {
          const statusColor =
            p.status === 'active'
              ? EMBER
              : p.status === 'pending'
                ? 'var(--app-text-secondary)'
                : 'var(--app-text-placeholder)';
          const statusLabel =
            p.status === 'active' ? 'Ativo' : p.status === 'pending' ? 'Em analise' : 'Rascunho';
          const planCountLabel =
            p.activePlansCount > 0
              ? `${p.activePlansCount} ${p.activePlansCount === 1 ? 'plano ativo' : 'planos ativos'}`
              : p.plansCount > 0
                ? `${p.plansCount} ${p.plansCount === 1 ? 'plano' : 'planos'}`
                : 'Sem planos';
          const mediaSize = isMobile ? 64 : 56;
          return (
            <div
              key={p.id}
              style={{
                position: 'relative',
                padding: isMobile ? '16px' : '14px 16px',
                background: BG_CARD,
                borderRadius: 12,
                border: `1px solid ${BORDER}`,
                overflow: 'visible',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? `${mediaSize}px minmax(0, 1fr)`
                    : `${mediaSize}px minmax(0, 1fr) auto`,
                  columnGap: isMobile ? 12 : 16,
                  rowGap: isMobile ? 10 : 0,
                  alignItems: 'stretch',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                    gridRow: isMobile ? '1 / span 3' : '1 / span 2',
                  }}
                >
                  <div
                    style={{
                      width: mediaSize,
                      height: mediaSize,
                      borderRadius: 12,
                      background: BG_ELEVATED,
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
                          borderRadius: 8,
                          display: 'block',
                        }}
                      />
                    ) : (
                      <span style={{ color: p.color || EMBER }}>{IC.box(20)}</span>
                    )}
                  </div>
                  <div style={{ position: 'relative', zIndex: 6 }}>
                    <IconActionButton
                      label={kloelT(`Editar`)}
                      color={EMBER}
                      onClick={() => router.push(`/products/${p.id}`)}
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
                        aria-hidden="true"
                      >
                        <path d={kloelT(`M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z`)} />
                        <path d={kloelT(`m15 5 4 4`)} />
                      </svg>
                    </IconActionButton>
                  </div>
                </div>

                <div
                  style={{
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isMobile ? 10 : 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        flex: 1,
                        fontFamily: SORA,
                        fontSize: isMobile ? 14 : 13,
                        fontWeight: 600,
                        color: 'var(--app-text-primary)',
                        lineHeight: 1.4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.name}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 3,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: 'var(--app-text-tertiary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '100%',
                        }}
                      >
                        {p.category}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: 'var(--app-text-secondary)',
                        }}
                      >
                        {planCountLabel}
                      </span>
                    </div>

                    {isMobile && (
                      <div style={{ flexShrink: 0, minWidth: 94, textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 15,
                            fontWeight: 600,
                            color: EMBER,
                          }}
                        >
                          {fmtBRL(p.revenue)}
                        </div>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 4,
                            marginTop: 2,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: statusColor,
                            }}
                          />
                          <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: isMobile ? '8px 12px' : '7px 12px',
                      borderRadius: 999,
                      border: p.hasPlanPricing
                        ? '1px solid rgba(232,93,48,0.18)'
                        : `1px solid ${BORDER}`,
                      background: p.hasPlanPricing
                        ? 'linear-gradient(180deg, rgba(232,93,48,0.1), rgba(232,93,48,0.04))'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                      maxWidth: '100%',
                      flexWrap: 'wrap',
                      alignSelf: 'flex-start',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: SORA,
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--app-text-secondary)',
                      }}
                    >
                      {kloelT(`Preço`)}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        fontWeight: 600,
                        color: p.hasPlanPricing ? EMBER : 'var(--app-text-secondary)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {p.priceLabel}
                    </span>
                  </div>
                </div>

                {!isMobile && (
                  <div
                    style={{
                      marginLeft: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ textAlign: 'right', minWidth: 104 }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 13,
                          fontWeight: 600,
                          color: EMBER,
                        }}
                      >
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
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: statusColor,
                          }}
                        />
                        <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
              color: 'var(--app-text-primary)',
              marginBottom: 16,
            }}
          >
            {kloelT(`Receita por Produto`)}
          </div>
          {displayProducts.map((p) => (
            <div key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span
                  style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-secondary)' }}
                >
                  {p.name}
                </span>
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
          <span
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`Saude operacional`)}
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
        ].map((stage) => (
          <div key={stage.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-secondary)' }}>
                {stage.label}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-primary)' }}>
                {fmt(stage.value)} ({stage.pct}
                {kloelT(`%)`)}
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
          <span
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`Motor IA`)}
          </span>
          <NP w={40} h={14} color={EMBER} />
        </div>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.6,
          }}
        >
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
        ].map((s) => (
          <div
            key={s.label}
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
                  color: 'var(--app-text-tertiary)',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
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
            color: 'var(--app-text-tertiary)',
            marginBottom: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
          }}
        >
          {kloelT(`Feed ao Vivo`)}
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
  displayAreas: DisplayArea[];
  avgCompletion: number;
  mutateAreas: () => void;
  productOptions: DisplayProduct[];
}) {
  const fid = useId();
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
  const focusPrimaryInput = useCallback((element: HTMLInputElement | null) => {
    if (!element) {
      return;
    }
    requestAnimationFrame(() => {
      element.focus();
    });
  }, []);

  // ── Student Enrollment State ──
  const [studentAreaId, setStudentAreaId] = useState<string | null>(null);
  const [studentAreaName, setStudentAreaName] = useState('');
  const [students, setStudents] = useState<MemberAreaStudent[]>([]);
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
      const resData =
        res.data && typeof res.data === 'object' ? (res.data as Record<string, unknown>) : null;
      setStudents(
        Array.isArray(resData)
          ? resData
          : Array.isArray(resData?.students)
            ? (resData.students as typeof students)
            : [],
      );
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
    if (!newStudent.name || !newStudent.email || !studentAreaId) {
      return;
    }
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
    if (!studentAreaId) {
      return;
    }
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
  const handleStartEditStudent = (student: MemberAreaStudent) => {
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
    if (!studentAreaId || !editingStudentId || !editStudentData.name || !editStudentData.email) {
      return;
    }
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
  const handleToggleStudentStatus = async (student: MemberAreaStudent) => {
    if (!studentAreaId) {
      return;
    }
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
    if (studentAreaId) {
      fetchStudents(studentAreaId, q || undefined);
    }
  };

  const toggleArea = (id: string) => setExpandedAreas((prev) => ({ ...prev, [id]: !prev[id] }));

  const toEmbed = (url: string) => toSupportedEmbedUrl(url) || '';

  // ── Handlers ──
  const handleCreateArea = async () => {
    if (!newArea.name.trim()) {
      return;
    }
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
    if (!editAreaData.name.trim()) {
      return;
    }
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
    if (!confirm('Excluir esta area?')) {
      return;
    }
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
    if (!newModule.name.trim()) {
      return;
    }
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
    if (!editModuleData.name.trim()) {
      return;
    }
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
    if (!confirm('Excluir este modulo?')) {
      return;
    }
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
    if (!newLesson.name.trim()) {
      return;
    }
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
    if (!editLessonData.name.trim()) {
      return;
    }
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
    if (!confirm('Excluir esta aula?')) {
      return;
    }
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

  const activeAreas = displayAreas.filter((area) => area.active !== false).length;
  const totalModules = displayAreas.reduce(
    (sum: number, area) => sum + Number(area.modulesCount || area.modules || 0),
    0,
  );
  const totalLessons = displayAreas.reduce(
    (sum: number, area) => sum + Number(area.lessonsCount || 0),
    0,
  );
  const certificatesEnabled = displayAreas.filter((area) => area.certificates !== false).length;
  const communityEnabled = displayAreas.filter((area) => area.community === true).length;
  const memberEvents =
    displayAreas.length > 0
      ? displayAreas.slice(0, 4).map((area) => ({
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
              color: 'var(--app-text-tertiary)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 4,
            }}
          >
            {kloelT(`Total de Alunos`)}
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
          {kloelT(`Engagement Pulse`)}
        </span>
        <NP w={120} h={24} color={PURPLE} />
      </div>

      {/* Ticker */}
      <Ticker
        items={
          displayAreas.length > 0
            ? displayAreas.map((a) => `${a.name}: ${a.students} alunos`)
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
        ].map((s) => (
          <div
            key={s.label}
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
                  color: 'var(--app-text-tertiary)',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
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
            color: 'var(--app-text-primary)',
            marginBottom: 16,
          }}
        >
          {kloelT(`Progresso por Area`)}
        </div>
        {displayAreas
          .filter((a) => a.completion > 0)
          .map((a) => (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                  {a.name}
                </span>
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
          <span
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`Recursos liberados`)}
          </span>
          <NP w={40} h={14} color={PURPLE} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Areas com certificado', value: String(certificatesEnabled) },
            { label: 'Areas com comunidade', value: String(communityEnabled) },
            { label: 'Modulos publicados', value: String(totalModules) },
            { label: 'Aulas publicadas', value: String(totalLessons) },
          ].map((c) => (
            <div
              key={c.label}
              style={{ padding: '10px 14px', background: BG_ELEVATED, borderRadius: 6 }}
            >
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: 'var(--app-text-tertiary)',
                  marginBottom: 4,
                }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                }}
              >
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
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`Gerenciar Areas`)}
          </div>
          <button
            type="button"
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
            <span style={{ color: '#fff' }}>{IC.plus(14)}</span> {kloelT(`Criar area`)}
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
                color: 'var(--app-text-tertiary)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase' as const,
                marginBottom: 10,
              }}
            >
              {kloelT(`Nova Area`)}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1.3 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-nome`}
                >
                  {kloelT(`Nome`)}
                </label>
                <input
                  value={newArea.name}
                  onChange={(e) => setNewArea((p) => ({ ...p, name: e.target.value }))}
                  placeholder={kloelT(`Nome da area...`)}
                  style={inputStyle}
                  id={`${fid}-nome`}
                />
              </div>
              <div style={{ width: 160 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-tipo`}
                >
                  {kloelT(`Tipo`)}
                </label>
                <select
                  value={newArea.type}
                  onChange={(e) => setNewArea((p) => ({ ...p, type: e.target.value }))}
                  style={selectStyle}
                  id={`${fid}-tipo`}
                >
                  <option value="COURSE">{kloelT(`Curso`)}</option>
                  <option value="COMMUNITY">{kloelT(`Comunidade`)}</option>
                  <option value="HYBRID">{kloelT(`Hibrido`)}</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-produto-vinc`}
                >
                  {kloelT(`Produto vinculado`)}
                </label>
                <select
                  value={newArea.productId}
                  onChange={(e) => setNewArea((p) => ({ ...p, productId: e.target.value }))}
                  style={selectStyle}
                  id={`${fid}-produto-vinc`}
                >
                  <option value="">{kloelT(`Sem vinculo`)}</option>
                  {productOptions.map((product) => (
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
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-slug`}
                >
                  {kloelT(`Slug`)}
                </label>
                <input
                  value={newArea.slug}
                  onChange={(e) => setNewArea((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="minha-area-de-membros"
                  style={inputStyle}
                  id={`${fid}-slug`}
                />
              </div>
              <div>
                <span
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  {kloelT(`Cor principal`)}
                </span>
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
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-desc`}
                >
                  {kloelT(`Descricao`)}
                </label>
                <input
                  value={newArea.description}
                  onChange={(e) => setNewArea((p) => ({ ...p, description: e.target.value }))}
                  placeholder={kloelT(`Resumo da experiencia para o aluno`)}
                  style={inputStyle}
                  id={`${fid}-desc`}
                />
              </div>
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-template`}
                >
                  {kloelT(`Template`)}
                </label>
                <select
                  value={newArea.template}
                  onChange={(e) => setNewArea((p) => ({ ...p, template: e.target.value }))}
                  style={selectStyle}
                  id={`${fid}-template`}
                >
                  <option value="academy">{kloelT(`Academy`)}</option>
                  <option value="community">{kloelT(`Community`)}</option>
                  <option value="membership">{kloelT(`Membership`)}</option>
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
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-logo`}
                >
                  {kloelT(`Logo da area`)}
                </label>
                <input
                  value={newArea.logoUrl}
                  onChange={(e) => setNewArea((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://..."
                  style={inputStyle}
                  id={`${fid}-logo`}
                />
              </div>
              <div>
                <label
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-capa`}
                >
                  {kloelT(`Capa da area`)}
                </label>
                <input
                  value={newArea.coverUrl}
                  onChange={(e) => setNewArea((p) => ({ ...p, coverUrl: e.target.value }))}
                  placeholder="https://..."
                  style={inputStyle}
                  id={`${fid}-capa`}
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
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(newArea as Record<string, unknown>)[toggle.key] as boolean}
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
                type="button"
                onClick={handleCreateArea}
                disabled={saving}
                style={{ ...btnPrimary(PURPLE), opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Salvando...' : 'Criar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateArea(false);
                  setNewArea(emptyAreaForm);
                }}
                style={btnGhost}
              >
                {kloelT(`Cancelar`)}
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
                color: 'var(--app-text-primary)',
                marginBottom: 6,
              }}
            >
              {kloelT(`Nenhuma area de membros cadastrada.`)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
              {kloelT(`Crie sua primeira area clicando em &quot;Criar area&quot; acima.`)}
            </div>
          </div>
        )}
        {displayAreas.map((a) => {
          const isExpanded = expandedAreas[a.id];
          const isEditing = editingArea === a.id;
          const modules: DisplayModule[] = a.modules_list || a.modulesList || [];
          const areaAccent = a.primaryColor || PURPLE;
          const previewHref = buildMemberAreaPreviewPath(a.id);

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
                  type="button"
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
                        ref={focusPrimaryInput}
                      />
                      <select
                        value={editAreaData.type}
                        onChange={(e) => setEditAreaData((p) => ({ ...p, type: e.target.value }))}
                        style={selectStyle}
                      >
                        <option value="COURSE">{kloelT(`Curso`)}</option>
                        <option value="COMMUNITY">{kloelT(`Comunidade`)}</option>
                        <option value="HYBRID">{kloelT(`Hibrido`)}</option>
                        <option value="MEMBERSHIP">{kloelT(`Membership`)}</option>
                      </select>
                      <select
                        value={editAreaData.productId}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, productId: e.target.value }))
                        }
                        style={selectStyle}
                      >
                        <option value="">{kloelT(`Sem vinculo`)}</option>
                        {productOptions.map((product) => (
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
                        placeholder={kloelT(`Descricao da area`)}
                        style={inputStyle}
                      />
                      <select
                        value={editAreaData.template}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, template: e.target.value }))
                        }
                        style={selectStyle}
                      >
                        <option value="academy">{kloelT(`Academy`)}</option>
                        <option value="community">{kloelT(`Community`)}</option>
                        <option value="membership">{kloelT(`Membership`)}</option>
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
                        placeholder={kloelT(`Slug da area`)}
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
                          placeholder={kloelT(`#8B5CF6`)}
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
                        placeholder={kloelT(`Logo da area`)}
                        style={inputStyle}
                      />
                      <input
                        aria-label="Capa da area"
                        value={editAreaData.coverUrl}
                        onChange={(e) =>
                          setEditAreaData((p) => ({ ...p, coverUrl: e.target.value }))
                        }
                        placeholder={kloelT(`Capa da area`)}
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
                            color: 'var(--app-text-secondary)',
                            fontFamily: SORA,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={
                              (editAreaData as Record<string, unknown>)[toggle.key] as boolean
                            }
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
                        type="button"
                        onClick={() => handleUpdateArea(a.id)}
                        disabled={saving}
                        style={{ ...btnPrimary(PURPLE), fontSize: 11, padding: '6px 12px' }}
                      >
                        {kloelT(`Salvar`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingArea(null)}
                        style={{ ...btnGhost, fontSize: 11, padding: '6px 12px' }}
                      >
                        {kloelT(`Cancelar`)}
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
                    <div
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => toggleArea(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          (e.currentTarget as HTMLElement).click();
                        }
                      }}
                    >
                      <div
                        style={{
                          fontFamily: SORA,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--app-text-primary)',
                        }}
                      >
                        {a.name}
                      </div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: 'var(--app-text-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {a.type === 'COURSE'
                          ? 'Curso'
                          : a.type === 'COMMUNITY'
                            ? 'Comunidade'
                            : a.type === 'HYBRID'
                              ? 'Hibrido'
                              : a.type}{' '}
                        {kloelT(`&middot;`)}{' '}
                        {typeof a.modules === 'number' ? a.modules : modules.length} modulos
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
                          color: 'var(--app-text-primary)',
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
                          {a.completion}
                          {kloelT(`% conclusao`)}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openStudentDrawer(a.id, a.name)}
                      style={{ ...iconBtn, color: '#E85D30' }}
                      title={kloelT(`Gerenciar alunos`)}
                    >
                      <svg
                        aria-hidden="true"
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path d={kloelT(`M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2`)} />
                        <circle cx="9" cy="7" r="4" />
                        <path d={kloelT(`M23 21v-2a4 4 0 0 0-3-3.87`)} />
                        <path d={kloelT(`M16 3.13a4 4 0 0 1 0 7.75`)} />
                      </svg>
                    </button>
                    <a
                      href={previewHref || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => {
                        if (!previewHref) {
                          event.preventDefault();
                        }
                      }}
                      aria-disabled={!previewHref}
                      style={{
                        ...iconBtn,
                        color: '#E85D30',
                        opacity: previewHref ? 1 : 0.45,
                        textDecoration: 'none',
                      }}
                      title={kloelT(`Pre-visualizar como aluno`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          (e.currentTarget as HTMLElement).click();
                        }
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </a>
                    <button
                      type="button"
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
                      style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
                      title={kloelT(`Editar area`)}
                    >
                      {IC.edit(16)}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteArea(a.id)}
                      style={{ ...iconBtn, color: '#EF4444' }}
                      title={kloelT(`Excluir area`)}
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
                            background: 'var(--app-bg-primary)',
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
                                background: 'var(--app-bg-primary)',
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
                                color: 'var(--app-text-primary)',
                              }}
                            >
                              {a.name}
                            </div>
                            <div
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                color: 'var(--app-text-secondary)',
                                marginTop: 2,
                              }}
                            >
                              {a.slug ? `/${a.slug}` : 'Slug automatico'} {kloelT(`&middot;`)}{' '}
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
                              {kloelT(`Cor principal`)} {a.primaryColor || PURPLE}
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
                            color: 'var(--app-text-primary)',
                          }}
                        >
                          {kloelT(`Configuracao da area`)}
                        </div>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            color: 'var(--app-text-tertiary)',
                            marginTop: 2,
                          }}
                        >
                          {a.template || 'academy'} {kloelT(`&middot;`)}{' '}
                          {a.productName || 'Sem produto vinculado'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleGenerateStructure(a.id)}
                          disabled={
                            generatingAreaId === a.id ||
                            (Array.isArray(modules) && modules.length > 0)
                          }
                          style={{
                            ...btnGhost,
                            color:
                              generatingAreaId === a.id ? 'var(--app-text-primary)' : areaAccent,
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
                        <a
                          href={previewHref || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => {
                            if (!previewHref) {
                              event.preventDefault();
                            }
                          }}
                          aria-disabled={!previewHref}
                          style={{
                            ...btnGhost,
                            color: '#E85D30',
                            opacity: previewHref ? 1 : 0.45,
                            textDecoration: 'none',
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              (e.currentTarget as HTMLElement).click();
                            }
                          }}
                        >
                          {kloelT(`Preview do aluno`)}
                        </a>
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: SORA,
                        fontSize: 12,
                        color: 'var(--app-text-secondary)',
                        lineHeight: 1.6,
                      }}
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
                    modules.map((mod) => {
                      const lessons: DisplayLesson[] = mod.lessons || [];
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
                                  ref={focusPrimaryInput}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateModule(a.id, mod.id)}
                                  disabled={saving}
                                  style={{
                                    ...btnPrimary(PURPLE),
                                    fontSize: 10,
                                    padding: '5px 10px',
                                  }}
                                >
                                  {kloelT(`Salvar`)}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingModule(null)}
                                  style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                >
                                  {kloelT(`Cancelar`)}
                                </button>
                              </div>
                            ) : (
                              <>
                                <span
                                  style={{
                                    fontFamily: SORA,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: 'var(--app-text-primary)',
                                    flex: 1,
                                  }}
                                >
                                  {mod.name}
                                </span>
                                <span
                                  style={{
                                    fontFamily: MONO,
                                    fontSize: 10,
                                    color: 'var(--app-text-tertiary)',
                                  }}
                                >
                                  {lessons.length} aulas
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingModule(mod.id);
                                    setEditModuleData({ name: mod.name });
                                  }}
                                  style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
                                  title={kloelT(`Editar modulo`)}
                                >
                                  {IC.edit(14)}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteModule(a.id, mod.id)}
                                  style={{ ...iconBtn, color: '#EF4444' }}
                                  title={kloelT(`Excluir modulo`)}
                                >
                                  {IC.trash(14)}
                                </button>
                              </>
                            )}
                          </div>

                          {/* Lessons */}
                          {lessons.map((lesson) => {
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
                                      placeholder={kloelT(`Nome da aula`)}
                                      style={{ ...inputStyle, fontSize: 11 }}
                                      ref={focusPrimaryInput}
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
                                      placeholder={kloelT(`Descricao`)}
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
                                      placeholder={kloelT(`YouTube URL`)}
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
                                          allow={kloelT(
                                            `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share`,
                                          )}
                                          referrerPolicy="strict-origin-when-cross-origin"
                                          style={{ border: 'none', borderRadius: 6 }}
                                          allowFullScreen
                                          title={kloelT(`Preview`)}
                                        />
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateLesson(a.id, lesson.id)}
                                        disabled={saving}
                                        style={{
                                          ...btnPrimary(PURPLE),
                                          fontSize: 10,
                                          padding: '5px 10px',
                                        }}
                                      >
                                        {kloelT(`Salvar`)}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingLesson(null)}
                                        style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                      >
                                        {kloelT(`Cancelar`)}
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
                                        style={{
                                          fontFamily: SORA,
                                          fontSize: 12,
                                          color: 'var(--app-text-primary)',
                                        }}
                                      >
                                        {lesson.name}
                                      </div>
                                      {lesson.description && (
                                        <div
                                          style={{
                                            fontFamily: MONO,
                                            fontSize: 10,
                                            color: 'var(--app-text-tertiary)',
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
                                            allow={kloelT(
                                              `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share`,
                                            )}
                                            referrerPolicy="strict-origin-when-cross-origin"
                                            style={{ border: 'none', borderRadius: 6 }}
                                            allowFullScreen
                                            title={lesson.name}
                                          />
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingLesson(lesson.id);
                                        setEditLessonData({
                                          name: lesson.name,
                                          description: lesson.description || '',
                                          videoUrl: lesson.videoUrl || '',
                                        });
                                      }}
                                      style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
                                      title={kloelT(`Editar aula`)}
                                    >
                                      {IC.edit(14)}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteLesson(a.id, lesson.id)}
                                      style={{ ...iconBtn, color: '#EF4444' }}
                                      title={kloelT(`Excluir aula`)}
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
                                  color: 'var(--app-text-tertiary)',
                                  letterSpacing: '0.15em',
                                  textTransform: 'uppercase' as const,
                                  marginBottom: 8,
                                }}
                              >
                                {kloelT(`Nova Aula`)}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <input
                                  aria-label="Nome da aula"
                                  value={newLesson.name}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, name: e.target.value }))
                                  }
                                  placeholder={kloelT(`Nome da aula`)}
                                  style={{ ...inputStyle, fontSize: 11 }}
                                  ref={focusPrimaryInput}
                                />
                                <input
                                  aria-label="Descricao da aula"
                                  value={newLesson.description}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, description: e.target.value }))
                                  }
                                  placeholder={kloelT(`Descricao (opcional)`)}
                                  style={{ ...inputStyle, fontSize: 11 }}
                                />
                                <input
                                  aria-label="URL do video"
                                  value={newLesson.videoUrl}
                                  onChange={(e) =>
                                    setNewLesson((p) => ({ ...p, videoUrl: e.target.value }))
                                  }
                                  placeholder={kloelT(`YouTube URL (opcional)`)}
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
                                      allow={kloelT(
                                        `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share`,
                                      )}
                                      referrerPolicy="strict-origin-when-cross-origin"
                                      style={{ border: 'none', borderRadius: 6 }}
                                      allowFullScreen
                                      title={kloelT(`Preview`)}
                                    />
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                  <button
                                    type="button"
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
                                    type="button"
                                    onClick={() => {
                                      setCreatingLesson(null);
                                      setNewLesson({ name: '', description: '', videoUrl: '' });
                                    }}
                                    style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                                  >
                                    {kloelT(`Cancelar`)}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
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
                              {IC.plus(14)} <span>{kloelT(`Adicionar aula`)}</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: 'var(--app-text-tertiary)',
                        marginBottom: 10,
                      }}
                    >
                      {kloelT(`Nenhum modulo nesta area.`)}
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
                          color: 'var(--app-text-tertiary)',
                          letterSpacing: '0.15em',
                          textTransform: 'uppercase' as const,
                          marginBottom: 8,
                        }}
                      >
                        {kloelT(`Novo Modulo`)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          aria-label="Nome do modulo"
                          value={newModule.name}
                          onChange={(e) => setNewModule({ name: e.target.value })}
                          placeholder={kloelT(`Nome do modulo`)}
                          style={{ ...inputStyle, flex: 1, fontSize: 11 }}
                          ref={focusPrimaryInput}
                        />
                        <button
                          type="button"
                          onClick={() => handleCreateModule(a.id)}
                          disabled={saving}
                          style={{ ...btnPrimary(PURPLE), fontSize: 10, padding: '5px 10px' }}
                        >
                          {saving ? 'Salvando...' : 'Criar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingModule(null);
                            setNewModule({ name: '' });
                          }}
                          style={{ ...btnGhost, fontSize: 10, padding: '5px 10px' }}
                        >
                          {kloelT(`Cancelar`)}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
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
                      {IC.plus(14)} <span>{kloelT(`Adicionar modulo`)}</span>
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
            color: 'var(--app-text-tertiary)',
            marginBottom: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
          }}
        >
          {kloelT(`Atividade Recente`)}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{
              width: 480,
              background: 'var(--app-bg-primary)',
              borderLeft: `1px solid ${BORDER}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column' as const,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
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
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--app-text-primary)',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Alunos`)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
                  {studentAreaName}
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar painel de alunos"
                onClick={() => {
                  setStudentAreaId(null);
                  setEditingStudentId(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--app-text-tertiary)',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <svg
                  aria-hidden="true"
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
                placeholder={kloelT(`Buscar aluno...`)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
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
                  placeholder={kloelT(`Nome do aluno *`)}
                  style={inputStyle}
                />
                <input
                  aria-label="Email do aluno"
                  value={newStudent.email}
                  onChange={(e) => setNewStudent((s) => ({ ...s, email: e.target.value }))}
                  placeholder={kloelT(`Email *`)}
                  type="email"
                  style={inputStyle}
                />
                <input
                  aria-label="Telefone do aluno"
                  value={newStudent.phone}
                  onChange={(e) => setNewStudent((s) => ({ ...s, phone: e.target.value }))}
                  placeholder={kloelT(`Telefone (opcional)`)}
                  style={inputStyle}
                />
                <button
                  type="button"
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
                      key={`skeleton-row-${index}`}
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
                          background: 'var(--app-bg-secondary)',
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
                    {kloelT(`SEM ALUNOS`)}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--app-text-primary)', fontFamily: SORA }}>
                    {kloelT(`Nenhum aluno matriculado`)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--app-text-tertiary)',
                      fontFamily: SORA,
                      marginTop: 4,
                    }}
                  >
                    {kloelT(`Clique em &quot;+ Aluno&quot; para adicionar`)}
                  </div>
                </div>
              ) : (
                students.map((s) => (
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
                            placeholder={kloelT(`Telefone`)}
                          />
                          <select
                            aria-label="Status do aluno"
                            value={editStudentData.status}
                            onChange={(e) =>
                              setEditStudentData((prev) => ({ ...prev, status: e.target.value }))
                            }
                            style={selectStyle}
                          >
                            <option value="active">{kloelT(`Ativo`)}</option>
                            <option value="suspended">{kloelT(`Suspenso`)}</option>
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
                            type="button"
                            onClick={handleUpdateStudent}
                            disabled={saving}
                            style={{
                              ...btnPrimary(PURPLE),
                              padding: '8px 12px',
                              opacity: saving ? 0.6 : 1,
                            }}
                          >
                            {kloelT(`Salvar aluno`)}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStudentId(null)}
                            style={{ ...btnGhost, padding: '8px 12px' }}
                          >
                            {kloelT(`Cancelar`)}
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
                              color: 'var(--app-text-primary)',
                              fontFamily: SORA,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' as const,
                            }}
                          >
                            {s.studentName}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--app-text-secondary)',
                              fontFamily: SORA,
                            }}
                          >
                            {s.studentEmail}
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                            {s.studentPhone ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: 'var(--app-text-tertiary)',
                                  fontFamily: MONO,
                                }}
                              >
                                {s.studentPhone}
                              </span>
                            ) : null}
                            <span style={{ fontSize: 10, color: PURPLE, fontFamily: MONO }}>
                              {Math.round(Number(s.progress || 0))}
                              {kloelT(`% progresso`)}
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
                          type="button"
                          aria-label="Editar aluno"
                          onClick={() => handleStartEditStudent(s)}
                          disabled={saving}
                          style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
                          title={kloelT(`Editar aluno`)}
                        >
                          {IC.edit(14)}
                        </button>
                        <button
                          type="button"
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
                          type="button"
                          aria-label="Remover aluno"
                          onClick={() => handleRemoveStudent(s.id)}
                          disabled={saving}
                          style={{ ...iconBtn, color: '#EF4444' }}
                          title={kloelT(`Remover aluno`)}
                        >
                          <svg
                            aria-hidden="true"
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path
                              d={kloelT(
                                `M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2`,
                              )}
                            />
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
  marketplace: MarketplaceItem[];
  earnings: number;
  marketplaceStats?: MarketplaceStats;
  affiliateLinks: AffiliateLink[];
  affiliateProducts: AffiliateProductItem[];
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [selectedMarketItem, setSelectedMarketItem] = useState<MarketplaceItem | null>(null);
  const [copiedAffiliate, setCopiedAffiliate] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [_savingId, setSavingId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const categories: string[] = [
    ...new Set(
      marketplace
        .map((m) => m.category)
        .filter((cat): cat is string => typeof cat === 'string' && cat.length > 0),
    ),
  ];
  const filteredMarket = marketplace.filter((m) => {
    const matchSearch =
      !search ||
      (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.category || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || m.category === catFilter;
    return matchSearch && matchCat;
  });
  const approvedLinks = affiliateLinks.filter((link) => link.active !== false);
  const savedProducts = affiliateProducts.filter(
    (item) => item.status === 'SAVED' || item.affiliateProduct?.isSaved,
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
            type="button"
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
            {kloelT(`&larr; Marketplace`)}
          </button>
          <span style={{ color: 'var(--app-text-tertiary)' }}>/</span>
          <span style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-primary)' }}>
            {item.name}
          </span>
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
                color: 'var(--app-text-tertiary)',
                letterSpacing: '0.25em',
                textTransform: 'uppercase' as const,
                marginBottom: 4,
              }}
            >
              {kloelT(`Comissao`)}
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
            <div
              style={{
                fontFamily: MONO,
                fontSize: 14,
                color: 'var(--app-text-primary)',
                marginTop: 4,
              }}
            >
              {fmtBRL(commissionPerSale)} {kloelT(`por venda`)}
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
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--app-text-primary)',
                }}
              >
                {item.name}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  marginTop: 4,
                }}
              >
                por {item.producer} {kloelT(`&middot;`)} {item.category}
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
            ].map((d) => (
              <div key={d.label}>
                <div
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-tertiary)',
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
                    color: 'var(--app-text-primary)',
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
              color: 'var(--app-text-primary)',
              marginBottom: 8,
            }}
          >
            {kloelT(`Descricao`)}
          </div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 13,
              color: 'var(--app-text-secondary)',
              lineHeight: 1.7,
            }}
          >
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
                color: 'var(--app-text-tertiary)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.25em',
              }}
            >
              {kloelT(`Projecao 30 dias`)}
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
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginTop: 4,
              }}
            >
              {kloelT(`~15 vendas estimadas`)}
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
                color: 'var(--app-text-tertiary)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.25em',
              }}
            >
              {kloelT(`Projecao 90 dias`)}
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
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                marginTop: 4,
              }}
            >
              {kloelT(`~50 vendas estimadas`)}
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
                color: 'var(--app-text-primary)',
                marginBottom: 12,
              }}
            >
              {kloelT(`Materiais de Divulgacao`)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {item.materials.map((mat: string) => (
                <span
                  key={mat}
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
                color: 'var(--app-text-primary)',
                marginBottom: 12,
              }}
            >
              {kloelT(`Seu Link de Afiliado`)}
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
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(item.affiliateLink || '').then(() => {
                    setCopiedAffiliate(true);
                    if (copiedTimer.current) {
                      clearTimeout(copiedTimer.current);
                    }
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
            <span
              style={{
                fontFamily: SORA,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
              {kloelT(`Analise IA`)}
            </span>
            <NP w={40} h={14} color={GREEN} />
          </div>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {kloelT(`Este produto tem alta taxa de conversao (`)}
            {item.rating || 0}/5) e comissao de {item.commission || 0}
            {kloelT(`%. Com base no seu publico, estimamos ganhos de`)} {fmtBRL(projected30)}{' '}
            {kloelT(`nos primeiros 30 dias. Recomendacao: usar trafego organico no
            Instagram com copy focada em transformacao.`)}
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          {item.affiliateLink ? (
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(item.affiliateLink || '').then(() => {
                  setCopiedAffiliate(true);
                  if (copiedTimer.current) {
                    clearTimeout(copiedTimer.current);
                  }
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
              type="button"
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
              color: 'var(--app-text-primary)',
              marginBottom: 16,
            }}
          >
            {kloelT(`Snapshot operacional`)}
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
                <div
                  style={{
                    fontFamily: SORA,
                    fontSize: 10,
                    color: 'var(--app-text-tertiary)',
                    marginBottom: 4,
                  }}
                >
                  {metric.label}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--app-text-primary)',
                  }}
                >
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
              color: 'var(--app-text-tertiary)',
              letterSpacing: '0.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 4,
            }}
          >
            {kloelT(`Ganhos Totais`)}
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
            color: 'var(--app-text-secondary)',
          }}
        >
          {IC.search(16)}
        </span>
        <input
          aria-label="Buscar produtos para se afiliar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={kloelT(`Buscar produtos para se afiliar...`)}
          style={{
            width: '100%',
            padding: '10px 14px 10px 36px',
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: 'var(--app-text-primary)',
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
          type="button"
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
            color: !catFilter ? 'var(--app-text-on-accent)' : 'var(--app-text-secondary)',
          }}
        >
          {kloelT(`Todos`)}
        </button>
        {categories.map((cat) => (
          <button
            type="button"
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
              color: catFilter === cat ? 'var(--app-text-on-accent)' : 'var(--app-text-secondary)',
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
        ].map((s) => (
          <div
            key={s.label}
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
                  color: 'var(--app-text-tertiary)',
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {s.label}
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
              }}
            >
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
                color: 'var(--app-text-primary)',
                marginBottom: 10,
              }}
            >
              {kloelT(`Meus links ativos`)}
            </div>
            {approvedLinks.slice(0, 3).map((link) => (
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
                  <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                    {link.affiliateProduct?.name || 'Produto'}
                  </div>
                  <div
                    style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-secondary)' }}
                  >
                    {link.clicks || 0} {kloelT(`cliques ·`)} {link.sales || 0} vendas
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(link.url || link.affiliateProduct?.affiliateLink || '')
                      .catch(() => {})
                  }
                  style={{ ...btnGhost, padding: '6px 10px' }}
                >
                  {kloelT(`Copiar`)}
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
                color: 'var(--app-text-primary)',
                marginBottom: 10,
              }}
            >
              {kloelT(`Produtos salvos`)}
            </div>
            {savedProducts.length > 0 ? (
              savedProducts.slice(0, 3).map((item) => (
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
                    <div
                      style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}
                    >
                      {item.affiliateProduct?.name || 'Produto salvo'}
                    </div>
                    <div
                      style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-secondary)' }}
                    >
                      {item.status || 'SAVED'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleSave(item.affiliateProductId || item.id, true)}
                    style={{ ...btnGhost, padding: '6px 10px' }}
                  >
                    {kloelT(`Remover`)}
                  </button>
                </div>
              ))
            ) : (
              <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {kloelT(`Salve produtos do marketplace para analisar depois.`)}
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
          color: 'var(--app-text-tertiary)',
          marginBottom: 10,
          letterSpacing: '0.25em',
          textTransform: 'uppercase' as const,
        }}
      >
        {kloelT(`Marketplace (`)}
        {filteredMarket.length} {kloelT(`produtos)`)}
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
                color: 'var(--app-text-primary)',
                marginBottom: 6,
              }}
            >
              {kloelT(`Nenhum produto disponivel no marketplace.`)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
              {kloelT(`Novos produtos serao exibidos aqui quando estiverem disponiveis.`)}
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
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
                <span
                  style={{
                    fontFamily: SORA,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--app-text-primary)',
                  }}
                >
                  {m.name}
                </span>
                {(m.temperature || 0) >= 90 && <span>{IC.fire(12)}</span>}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: 'var(--app-text-tertiary)',
                  marginTop: 2,
                }}
              >
                {m.category} {kloelT(`&middot; por`)} {m.producer}
              </div>
            </div>
            <NP w={100} h={24} color={GREEN} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: GREEN }}>
                {m.commission || 0}%
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: 'var(--app-text-secondary)',
                  marginTop: 2,
                }}
              >
                {fmtBRL(m.price || 0)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#E85D30' }}>{IC.star(12)}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}>
                {m.rating || 0}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSave(m.id, !!m.isSaved);
              }}
              style={{
                ...iconBtn,
                color: m.isSaved ? GREEN : 'var(--app-text-secondary)',
              }}
              title={m.isSaved ? 'Remover dos salvos' : 'Salvar produto'}
            >
              {IC.heart(14)}
            </button>
            <span style={{ color: 'var(--app-text-tertiary)', fontFamily: SORA, fontSize: 16 }}>
              {kloelT(`&rsaquo;`)}
            </span>
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
            color: 'var(--app-text-tertiary)',
            marginBottom: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
          }}
        >
          {kloelT(`Vendas Recentes`)}
        </div>
        <LiveFeed
          color={GREEN}
          events={
            approvedLinks.length > 0
              ? approvedLinks.slice(0, 4).map((link) => ({
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
  const { isMobile } = useResponsiveViewport();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const requestedFeature = searchParams?.get('feature') || '';

  // ── Real data hooks ──
  const { products: rawProducts, mutate: mutateProducts } = useProducts();
  const { areas: rawAreas, mutate: mutateAreas } = useMemberAreas();
  const { deleteProduct } = useProductMutations();

  // ── Affiliate data ──
  const [marketplace, setMarketplace] = useState<MarketplaceItem[]>([]);
  const [marketplaceStats, setMarketplaceStats] = useState<MarketplaceStats>({});
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [affiliateTotals, setAffiliateTotals] = useState<{
    clicks: number;
    sales: number;
    revenue: number;
    commission: number;
  }>({
    clicks: 0,
    sales: 0,
    revenue: 0,
    commission: 0,
  });
  const [affiliateProducts, setAffiliateProducts] = useState<AffiliateProductItem[]>([]);

  const hydrateAffiliate = useCallback(async () => {
    try {
      const [marketplaceResponse, statsResponse, linksResponse, productsResponse] =
        await Promise.all([
          affiliateApi.marketplace(),
          affiliateApi.marketplaceStats(),
          affiliateApi.myLinks(),
          affiliateApi.myProducts(),
        ]);

      const mktData = marketplaceResponse.data;
      setMarketplace(Array.isArray(mktData?.products) ? mktData.products : []);
      const sData = statsResponse.data;
      setMarketplaceStats(sData ?? {});
      const lnkData = linksResponse.data;
      setAffiliateLinks(Array.isArray(lnkData?.links) ? lnkData.links : []);
      setAffiliateTotals(lnkData?.totals ?? { clicks: 0, sales: 0, revenue: 0, commission: 0 });
      const prdData = productsResponse.data;
      setAffiliateProducts(Array.isArray(prdData) ? prdData : []);
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
  const displayProducts: DisplayProduct[] = Array.isArray(rawProducts)
    ? (rawProducts as RawProductPayload[]).map((p) =>
        normalizeDisplayProduct(p, getProductPlanPriceSummary(p)),
      )
    : [];

  // ── Normalize areas ──
  const displayAreas: DisplayArea[] = Array.isArray(rawAreas)
    ? (rawAreas as RawAreaPayload[]).map((a) => ({
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
        productName: displayProducts.find((product) => product.id === a.productId)?.name || '',
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
    (s, p) => s + (p.revenue || p.price * (p.sales || 0)),
    0,
  );
  const totalSales = displayProducts.reduce((s, p) => s + (p.sales || 0), 0);
  const activeProducts = displayProducts.filter((p) => p.status === 'active').length;
  const totalStudents = displayAreas.reduce((s, a) => s + (a.students || 0), 0);
  const areasWithCompletion = displayAreas.filter((a) => a.completion > 0);
  const avgCompletion =
    areasWithCompletion.length > 0
      ? Math.round(
          areasWithCompletion.reduce((s, a) => s + a.completion, 0) / areasWithCompletion.length,
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
      if (!tab || pathname === tab.route) {
        return;
      }
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
    if (!requestedFeature || activeTab !== 'produtos' || displayProducts.length === 0) {
      return;
    }
    router.replace(buildFeatureHref(displayProducts[0].id, requestedFeature));
  }, [requestedFeature, activeTab, displayProducts, router, buildFeatureHref]);

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════
  return (
    <div
      data-testid="products-view-root"
      style={{
        minHeight: '100vh',
        background: 'var(--app-bg-primary)',
        color: 'var(--app-text-primary)',
        fontFamily: SORA,
        padding: isMobile ? 16 : 24,
      }}
    >
      <style>{ANIMATIONS}</style>

      {/* Page container */}
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {/* Tab Navigation — pill style (same pattern as Marketing) */}
        <div
          style={{
            ...SUBINTERFACE_PILL_ROW_STYLE,
            scrollbarWidth: 'none',
          }}
        >
          {TABS.filter((t) => t.key !== 'membros').map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={getSubinterfacePillStyle(isActive, isMobile)}
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
