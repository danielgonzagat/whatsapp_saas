'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProduct, useProductMutations } from '@/hooks/useProducts';
import { useCheckoutPlans, useCheckoutCoupons, useOrderBumps } from '@/hooks/useCheckoutPlans';
import { apiFetch } from '@/lib/api';

/* ═══════════════════════════════════════════════════
   V — KLOEL Terminator palette
   ═══════════════════════════════════════════════════ */
const V = {
  void: '#0A0A0C',
  surface: '#111113',
  elevated: '#19191C',
  border: '#222226',
  glow: '#333338',
  silver: '#E0DDD8',
  muted: '#6E6E73',
  dim: '#3A3A3F',
  ember: '#E85D30',
  emberDim: 'rgba(232,93,48,0.15)',
  emberGhost: 'rgba(232,93,48,0.06)',
  green: '#34C759',
  greenDim: 'rgba(52,199,89,0.12)',
  red: '#FF453A',
  redDim: 'rgba(255,69,58,0.12)',
  yellow: '#FFD60A',
  yellowDim: 'rgba(255,214,10,0.12)',
  font: "'Sora', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

/* ═══════════════════════════════════════════════════
   SHARED STYLES
   ═══════════════════════════════════════════════════ */
const card: React.CSSProperties = {
  background: V.surface,
  border: `1px solid ${V.border}`,
  borderRadius: 10,
  padding: 20,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: V.elevated,
  border: `1px solid ${V.border}`,
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 13,
  color: V.silver,
  fontFamily: V.font,
  outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  background: V.ember,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: V.font,
  cursor: 'pointer',
  transition: 'opacity .15s',
};
const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: V.muted,
  border: `1px solid ${V.border}`,
  borderRadius: 8,
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: V.font,
  cursor: 'pointer',
  transition: 'all .15s',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  color: V.muted,
  marginBottom: 6,
  fontFamily: V.font,
};
const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: `1px solid ${V.border}`,
  margin: '20px 0',
};
const badgeStyle = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 10px',
  borderRadius: 99,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: V.font,
  background: bg,
  color: fg,
});

/* ═══════════════════════════════════════════════════
   IC — Inline SVG icon paths
   ═══════════════════════════════════════════════════ */
const IC = {
  back: 'M15 19l-7-7 7-7',
  box: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  plan: 'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  cart: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0',
  link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 3a4 4 0 110 8 4 4 0 010-8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  brain: 'M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z M9 22h6',
  plus: 'M12 5v14M5 12h14',
  copy: 'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2 M8 2h8v4H8z',
  trash: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  chevDown: 'M6 9l6 6 6-6',
  bump: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  save: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z M17 21v-8H7v8 M7 3v5h8',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 110 6 3 3 0 010-6z',
  config: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 8a4 4 0 110 8 4 4 0 010-8z',
};
const Ico = ({ d, size = 18, color = V.muted, style: s }: { d: string; size?: number; color?: string; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={s}>
    {d.split(' M').map((seg, i) => (
      <path key={i} d={i === 0 ? seg : `M${seg}`} />
    ))}
  </svg>
);

/* ═══════════════════════════════════════════════════
   NP — Neural Pulse Canvas
   ═══════════════════════════════════════════════════ */
function NeuralPulse({ height = 120 }: { height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const W = c.width;
    const H = c.height;
    const pts = Array.from({ length: 40 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      pts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      });
      ctx.strokeStyle = 'rgba(232,93,48,0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          if (dx * dx + dy * dy < 12000) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,93,48,0.2)';
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      width={800}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height, pointerEvents: 'none', opacity: 0.6 }}
    />
  );
}

/* ═══════════════════════════════════════════════════
   Ticker — animated number counter
   ═══════════════════════════════════════════════════ */
function Ticker({ value, prefix = '', suffix = '', decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = value || 0;
    const steps = 30;
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(target * eased);
      if (step >= steps) clearInterval(iv);
    }, 16);
    return () => clearInterval(iv);
  }, [value]);
  return (
    <span style={{ fontFamily: V.mono, fontWeight: 700, fontSize: 22, color: V.silver }}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   TabNav — tab navigation strip
   ═══════════════════════════════════════════════════ */
const TABS = [
  { id: 'dados', label: 'Dados', icon: IC.box },
  { id: 'planos', label: 'Planos', icon: IC.plan },
  { id: 'checkouts', label: 'Checkouts', icon: IC.cart },
  { id: 'urls', label: 'URLs', icon: IC.link },
  { id: 'comissao', label: 'Comissao', icon: IC.users },
  { id: 'cupons', label: 'Cupons', icon: IC.tag },
  { id: 'avaliacoes', label: 'Avaliacoes', icon: IC.star },
  { id: 'campanhas', label: 'Campanhas', icon: IC.link },
  { id: 'afterpay', label: 'After Pay', icon: IC.cart },
  { id: 'ia', label: 'IA Config', icon: IC.brain },
] as const;

type TabId = (typeof TABS)[number]['id'];

function TabNav({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, overflowX: 'auto', borderBottom: `1px solid ${V.border}`, paddingBottom: 0 }}>
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '11px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${isActive ? V.ember : 'transparent'}`,
              color: isActive ? V.ember : V.muted,
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              fontFamily: V.font,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all .15s',
            }}
          >
            <Ico d={t.icon} size={16} color={isActive ? V.ember : V.muted} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Toggle — switch component
   ═══════════════════════════════════════════════════ */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? V.ember : V.border,
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background .2s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: '#fff',
            transition: 'left .2s',
          }}
        />
      </button>
      {label && <span style={{ fontSize: 13, color: V.muted, fontFamily: V.font }}>{label}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Field — labeled input
   ═══════════════════════════════════════════════════ */
function Field({ label: lbl, value, onChange, placeholder, type = 'text', rows, disabled, mono }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  rows?: number;
  disabled?: boolean;
  mono?: boolean;
}) {
  const extra: React.CSSProperties = mono ? { fontFamily: V.mono, fontSize: 12 } : {};
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{lbl}</label>
      {rows ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          style={{ ...inputStyle, ...extra, resize: 'vertical' }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{ ...inputStyle, ...extra }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Helper: format currency
   ═══════════════════════════════════════════════════ */
function fmtCurrency(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}
function fmtDate(d: string | undefined): string {
  if (!d) return '--';
  try {
    return new Date(d).toLocaleDateString('pt-BR');
  } catch {
    return d;
  }
}

/* ═══════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════ */
export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;

  /* ── data hooks ── */
  const { product: rawProduct, isLoading: prodLoading, mutate: mutateProd } = useProduct(productId);
  const p: any = rawProduct || {};
  const { updateProduct } = useProductMutations();

  const { plans, isLoading: plansLoading, createPlan, duplicatePlan, deletePlan, updatePlan } = useCheckoutPlans(rawProduct);
  const { coupons, isLoading: couponsLoading, createCoupon, deleteCoupon } = useCheckoutCoupons();

  /* ── local state ── */
  const [tab, setTab] = useState<TabId>('dados');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planSubTab, setPlanSubTab] = useState<'geral' | 'bumps' | 'config'>('geral');

  /* ── urls state ── */
  const [urls, setUrls] = useState<any[]>([]);
  const [urlsLoading, setUrlsLoading] = useState(false);

  /* ── reviews state ── */
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  /* ── order bumps hook ── */
  const { bumps, isLoading: bumpsLoading, createBump, deleteBump } = useOrderBumps(selectedPlanId);

  /* ── form state for product editing ── */
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editSalesUrl, setEditSalesUrl] = useState('');
  const [editThankUrl, setEditThankUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync form when product loads
  useEffect(() => {
    if (p?.name) {
      setEditName(p.name || '');
      setEditDesc(p.description || '');
      setEditPrice(String(p.price || 0));
      setEditCategory(p.category || '');
      setEditActive(p.active !== false);
      setEditSalesUrl(p.salesPageUrl || '');
      setEditThankUrl(p.thankyouUrl || '');
    }
  }, [p?.name, p?.description, p?.price, p?.category, p?.active, p?.salesPageUrl, p?.thankyouUrl]);

  /* ── fetch URLs ── */
  useEffect(() => {
    if (tab === 'urls' && productId) {
      setUrlsLoading(true);
      apiFetch(`/products/${productId}/urls`)
        .then((res: any) => setUrls(Array.isArray(res) ? res : res?.urls || []))
        .catch(() => setUrls([]))
        .finally(() => setUrlsLoading(false));
    }
  }, [tab, productId]);

  /* ── fetch Reviews ── */
  useEffect(() => {
    if (tab === 'avaliacoes' && productId) {
      setReviewsLoading(true);
      apiFetch(`/products/${productId}/reviews`)
        .then((res: any) => setReviews(Array.isArray(res) ? res : res?.reviews || []))
        .catch(() => setReviews([]))
        .finally(() => setReviewsLoading(false));
    }
  }, [tab, productId]);

  /* ── plan form state ── */
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState('');
  const [showNewPlan, setShowNewPlan] = useState(false);

  /* ── coupon form state ── */
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponDiscount, setNewCouponDiscount] = useState('');
  const [showNewCoupon, setShowNewCoupon] = useState(false);

  /* ── bump form state ── */
  const [newBumpName, setNewBumpName] = useState('');
  const [newBumpPrice, setNewBumpPrice] = useState('');
  const [showNewBump, setShowNewBump] = useState(false);

  /* ── IA config state ── */
  const [iaPrompt, setIaPrompt] = useState('');
  const [iaTone, setIaTone] = useState('profissional');
  const [iaAutoReply, setIaAutoReply] = useState(true);

  /* ── selected plan object ── */
  const selectedPlan = useMemo(() => {
    if (!selectedPlanId) return null;
    return (plans || []).find((pl: any) => pl.id === selectedPlanId) || null;
  }, [plans, selectedPlanId]);

  /* ── derived checkouts from plans ── */
  const checkouts = useMemo(() => {
    return (plans || []).map((pl: any) => ({
      id: pl.id,
      planName: pl.name,
      slug: pl.slug || pl.referenceCode || pl.id?.slice(0, 8),
      url: `/checkout/${pl.slug || pl.referenceCode || pl.id}`,
      active: pl.active !== false,
    }));
  }, [plans]);

  /* ── computed stats ── */
  const totalPlans = (plans || []).length;
  const totalCoupons = (coupons || []).length;
  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0 ? reviews.reduce((s: number, r: any) => s + (r.rating || 0), 0) / totalReviews : 0;

  /* ── save product ── */
  const handleSaveProduct = async () => {
    setSaving(true);
    try {
      await updateProduct(productId, {
        name: editName,
        description: editDesc,
        price: parseFloat(editPrice) || 0,
        category: editCategory,
        active: editActive,
        salesPageUrl: editSalesUrl,
        thankyouUrl: editThankUrl,
      });
      mutateProd();
    } catch (e) {
      console.error('Save error:', e);
    } finally {
      setSaving(false);
    }
  };

  /* ── create plan ── */
  const handleCreatePlan = async () => {
    if (!newPlanName) return;
    await createPlan({
      name: newPlanName,
      priceInCents: Math.round(parseFloat(newPlanPrice || '0') * 100),
    });
    setNewPlanName('');
    setNewPlanPrice('');
    setShowNewPlan(false);
  };

  /* ── create coupon ── */
  const handleCreateCoupon = async () => {
    if (!newCouponCode) return;
    await createCoupon({
      code: newCouponCode.toUpperCase(),
      discountPercent: parseFloat(newCouponDiscount || '0'),
    });
    setNewCouponCode('');
    setNewCouponDiscount('');
    setShowNewCoupon(false);
  };

  /* ── create bump ── */
  const handleCreateBump = async () => {
    if (!newBumpName) return;
    await createBump({
      name: newBumpName,
      priceInCents: Math.round(parseFloat(newBumpPrice || '0') * 100),
    });
    setNewBumpName('');
    setNewBumpPrice('');
    setShowNewBump(false);
  };

  /* ── copy helper ── */
  const copyToClip = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  /* ═══════════════════════════════════════════════════
     RENDER: Loading state
     ═══════════════════════════════════════════════════ */
  if (prodLoading) {
    return (
      <div style={{ minHeight: '100vh', background: V.void, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: `3px solid ${V.border}`,
            borderTopColor: V.ember,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <p style={{ color: V.muted, fontFamily: V.font, fontSize: 14 }}>Carregando produto...</p>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     RENDER: Plan detail sub-view
     ═══════════════════════════════════════════════════ */
  const renderPlanDetail = () => {
    if (!selectedPlan) return null;
    const sp: any = selectedPlan;
    const PLAN_SUB_TABS = [
      { id: 'geral' as const, label: 'Geral' },
      { id: 'bumps' as const, label: 'Order Bumps' },
      { id: 'config' as const, label: 'Config Checkout' },
    ];
    return (
      <div>
        {/* Back to plans list */}
        <button
          onClick={() => { setSelectedPlanId(null); setPlanSubTab('geral'); }}
          style={{ ...btnSecondary, marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Ico d={IC.back} size={14} color={V.muted} />
          Voltar para planos
        </button>

        {/* Plan header */}
        <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: V.silver, fontFamily: V.font }}>{sp.name}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: V.muted, fontFamily: V.mono }}>
              {fmtCurrency(sp.priceInCents || 0)} &middot; Ref: {sp.referenceCode || sp.slug || sp.id?.slice(0, 8)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { if (confirm('Duplicar este plano?')) duplicatePlan(sp); }}
              style={btnSecondary}
            >
              <Ico d={IC.copy} size={14} color={V.muted} /> Duplicar
            </button>
            <button
              onClick={() => { if (confirm('Excluir este plano?')) { deletePlan(sp.id); setSelectedPlanId(null); } }}
              style={{ ...btnSecondary, color: V.red, borderColor: V.red }}
            >
              <Ico d={IC.trash} size={14} color={V.red} /> Excluir
            </button>
          </div>
        </div>

        {/* Sub-tab nav */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: `1px solid ${V.border}` }}>
          {PLAN_SUB_TABS.map((st) => (
            <button
              key={st.id}
              onClick={() => setPlanSubTab(st.id)}
              style={{
                padding: '9px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${planSubTab === st.id ? V.ember : 'transparent'}`,
                color: planSubTab === st.id ? V.ember : V.muted,
                fontSize: 13,
                fontWeight: planSubTab === st.id ? 600 : 500,
                fontFamily: V.font,
                cursor: 'pointer',
              }}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Sub-tab: Geral */}
        {planSubTab === 'geral' && (
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Nome do Plano</label>
                <div style={{ ...inputStyle, background: V.elevated, cursor: 'default' }}>{sp.name}</div>
              </div>
              <div>
                <label style={labelStyle}>Preco (centavos)</label>
                <div style={{ ...inputStyle, fontFamily: V.mono, cursor: 'default' }}>{sp.priceInCents || 0}</div>
              </div>
              <div>
                <label style={labelStyle}>Quantidade</label>
                <div style={{ ...inputStyle, cursor: 'default' }}>{sp.quantity || 1}</div>
              </div>
              <div>
                <label style={labelStyle}>Max Parcelas</label>
                <div style={{ ...inputStyle, cursor: 'default' }}>{sp.maxInstallments || 1}</div>
              </div>
            </div>
            <hr style={dividerStyle} />
            <div style={{ display: 'flex', gap: 20 }}>
              <Toggle checked={sp.freeShipping || false} onChange={() => {}} label="Frete gratis" />
              <Toggle checked={sp.active !== false} onChange={() => {}} label="Ativo" />
            </div>
          </div>
        )}

        {/* Sub-tab: Order Bumps */}
        {planSubTab === 'bumps' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: V.silver, fontFamily: V.font }}>
                Order Bumps ({(bumps || []).length})
              </h4>
              <button onClick={() => setShowNewBump(true)} style={btnPrimary}>
                <Ico d={IC.plus} size={14} color="#fff" /> Novo Bump
              </button>
            </div>

            {showNewBump && (
              <div style={{ ...card, marginBottom: 16 }}>
                <Field label="Nome" value={newBumpName} onChange={setNewBumpName} placeholder="Nome do bump" />
                <Field label="Preco (R$)" value={newBumpPrice} onChange={setNewBumpPrice} type="number" placeholder="29.90" />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleCreateBump} style={btnPrimary}>Criar</button>
                  <button onClick={() => setShowNewBump(false)} style={btnSecondary}>Cancelar</button>
                </div>
              </div>
            )}

            {bumpsLoading ? (
              <p style={{ color: V.muted, fontFamily: V.font, fontSize: 13 }}>Carregando bumps...</p>
            ) : (bumps || []).length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: 40 }}>
                <Ico d={IC.bump} size={32} color={V.dim} />
                <p style={{ color: V.muted, fontFamily: V.font, fontSize: 13, marginTop: 12 }}>
                  Nenhum order bump cadastrado.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(bumps || []).map((b: any) => (
                  <div key={b.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: V.silver, fontFamily: V.font, fontSize: 14, fontWeight: 600 }}>{b.name}</span>
                      <span style={{ marginLeft: 12, color: V.muted, fontFamily: V.mono, fontSize: 12 }}>
                        {fmtCurrency(b.priceInCents || 0)}
                      </span>
                    </div>
                    <button
                      onClick={() => { if (confirm('Excluir bump?')) deleteBump(b.id); }}
                      style={{ ...btnSecondary, padding: '6px 12px', color: V.red, borderColor: V.red }}
                    >
                      <Ico d={IC.trash} size={14} color={V.red} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sub-tab: Config Checkout */}
        {planSubTab === 'config' && (
          <div style={card}>
            <p style={{ color: V.muted, fontFamily: V.font, fontSize: 13 }}>
              Configuracao avancada de checkout para este plano. Use a pagina dedicada de checkout para editar templates, cores,
              campos customizados e scripts de rastreamento.
            </p>
            <hr style={dividerStyle} />
            <button
              onClick={() => router.push(`/checkout/config/${sp.id}`)}
              style={btnPrimary}
            >
              <Ico d={IC.config} size={14} color="#fff" /> Abrir Configurador
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════
     RENDER TABS
     ═══════════════════════════════════════════════════ */

  /* ── TAB: Dados ── */
  const renderDados = () => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Nome do produto" value={editName} onChange={setEditName} placeholder="Nome" />
        <Field label="Categoria" value={editCategory} onChange={setEditCategory} placeholder="Categoria" />
      </div>
      <Field label="Descricao" value={editDesc} onChange={setEditDesc} placeholder="Descricao do produto" rows={4} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Preco (R$)" value={editPrice} onChange={setEditPrice} type="number" placeholder="0.00" mono />
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Status</label>
          <Toggle checked={editActive} onChange={setEditActive} label={editActive ? 'Ativo' : 'Inativo'} />
        </div>
      </div>
      <hr style={dividerStyle} />
      <h4 style={{ fontSize: 14, fontWeight: 600, color: V.silver, fontFamily: V.font, margin: '0 0 12px' }}>URLs</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Pagina de vendas" value={editSalesUrl} onChange={setEditSalesUrl} placeholder="https://..." mono />
        <Field label="Pagina de obrigado" value={editThankUrl} onChange={setEditThankUrl} placeholder="https://..." mono />
      </div>
      <hr style={dividerStyle} />
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={handleSaveProduct} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          <Ico d={IC.save} size={14} color="#fff" /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );

  /* ── TAB: Planos ── */
  const renderPlanos = () => {
    if (selectedPlanId) return renderPlanDetail();

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: V.silver, fontFamily: V.font }}>
            Planos ({totalPlans})
          </h3>
          <button onClick={() => setShowNewPlan(true)} style={btnPrimary}>
            <Ico d={IC.plus} size={14} color="#fff" /> Novo Plano
          </button>
        </div>

        {showNewPlan && (
          <div style={{ ...card, marginBottom: 16 }}>
            <Field label="Nome" value={newPlanName} onChange={setNewPlanName} placeholder="Nome do plano" />
            <Field label="Preco (R$)" value={newPlanPrice} onChange={setNewPlanPrice} type="number" placeholder="97.00" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={handleCreatePlan} style={btnPrimary}>Criar Plano</button>
              <button onClick={() => setShowNewPlan(false)} style={btnSecondary}>Cancelar</button>
            </div>
          </div>
        )}

        {plansLoading ? (
          <p style={{ color: V.muted, fontFamily: V.font, fontSize: 13 }}>Carregando planos...</p>
        ) : totalPlans === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 48 }}>
            <Ico d={IC.plan} size={36} color={V.dim} />
            <p style={{ color: V.muted, fontFamily: V.font, fontSize: 14, marginTop: 12 }}>
              Nenhum plano cadastrado.
            </p>
            <p style={{ color: V.dim, fontFamily: V.font, fontSize: 12, marginTop: 4 }}>
              Crie seu primeiro plano para comecar a vender.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(plans || []).map((pl: any) => (
              <div
                key={pl.id}
                onClick={() => setSelectedPlanId(pl.id)}
                style={{
                  ...card,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'border-color .15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = V.ember; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = V.border; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: V.emberGhost,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ico d={IC.plan} size={18} color={V.ember} />
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: V.silver, fontFamily: V.font }}>
                      {pl.name}
                    </span>
                    <span style={{ fontSize: 12, color: V.muted, fontFamily: V.mono }}>
                      {fmtCurrency(pl.priceInCents || 0)}
                      {pl.maxInstallments > 1 ? ` · ate ${pl.maxInstallments}x` : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {pl.freeShipping && (
                    <span style={badgeStyle(V.greenDim, V.green)}>Frete gratis</span>
                  )}
                  <span style={badgeStyle(pl.active !== false ? V.greenDim : V.redDim, pl.active !== false ? V.green : V.red)}>
                    {pl.active !== false ? 'Ativo' : 'Inativo'}
                  </span>
                  <Ico d={IC.chevDown} size={16} color={V.muted} style={{ transform: 'rotate(-90deg)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ── TAB: Checkouts ── */
  const renderCheckouts = () => (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: V.silver, fontFamily: V.font }}>
        Checkouts ({checkouts.length})
      </h3>
      {checkouts.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <Ico d={IC.cart} size={36} color={V.dim} />
          <p style={{ color: V.muted, fontFamily: V.font, fontSize: 14, marginTop: 12 }}>
            Crie planos para gerar links de checkout.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {checkouts.map((co: any) => (
            <div key={co.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: V.silver, fontFamily: V.font }}>{co.planName}</span>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{
                    fontFamily: V.mono,
                    fontSize: 12,
                    color: V.muted,
                    background: V.elevated,
                    padding: '3px 8px',
                    borderRadius: 4,
                  }}>
                    {co.url}
                  </code>
                  <button
                    onClick={() => copyToClip(co.url)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                    title="Copiar"
                  >
                    <Ico d={IC.copy} size={14} color={V.muted} />
                  </button>
                </div>
              </div>
              <span style={badgeStyle(co.active ? V.greenDim : V.redDim, co.active ? V.green : V.red)}>
                {co.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ── TAB: URLs ── */
  const renderUrls = () => (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: V.silver, fontFamily: V.font }}>
        URLs do Produto
      </h3>
      {urlsLoading ? (
        <p style={{ color: V.muted, fontFamily: V.font, fontSize: 13 }}>Carregando URLs...</p>
      ) : urls.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <Ico d={IC.link} size={36} color={V.dim} />
          <p style={{ color: V.muted, fontFamily: V.font, fontSize: 14, marginTop: 12 }}>
            Nenhuma URL configurada.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {urls.map((u: any, i: number) => (
            <div key={u.id || i} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: V.silver, fontFamily: V.font }}>
                  {u.label || u.type || `URL ${i + 1}`}
                </span>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontFamily: V.mono, fontSize: 12, color: V.muted, background: V.elevated, padding: '3px 8px', borderRadius: 4 }}>
                    {u.url || u.value || '--'}
                  </code>
                  <button
                    onClick={() => copyToClip(u.url || u.value || '')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                    title="Copiar"
                  >
                    <Ico d={IC.copy} size={14} color={V.muted} />
                  </button>
                </div>
              </div>
              {u.clicks !== undefined && (
                <span style={{ fontFamily: V.mono, fontSize: 12, color: V.muted }}>
                  {u.clicks} cliques
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ── TAB: Comissao ── */
  const renderComissao = () => (
    <div style={card}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: V.silver, fontFamily: V.font }}>
        Comissionamento
      </h3>
      <p style={{ color: V.muted, fontFamily: V.font, fontSize: 13, lineHeight: 1.6 }}>
        Configure as comissoes de afiliados e co-produtores para este produto.
        As regras de comissionamento sao aplicadas automaticamente em cada venda.
      </p>
      <hr style={dividerStyle} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div style={{ ...card, background: V.elevated, textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: V.muted, fontFamily: V.font, margin: '0 0 8px' }}>
            Produtor
          </p>
          <span style={{ fontFamily: V.mono, fontSize: 24, fontWeight: 700, color: V.ember }}>
            {p.producerCommission || 80}%
          </span>
        </div>
        <div style={{ ...card, background: V.elevated, textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: V.muted, fontFamily: V.font, margin: '0 0 8px' }}>
            Afiliado
          </p>
          <span style={{ fontFamily: V.mono, fontSize: 24, fontWeight: 700, color: V.green }}>
            {p.affiliateCommission || 20}%
          </span>
        </div>
        <div style={{ ...card, background: V.elevated, textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: V.muted, fontFamily: V.font, margin: '0 0 8px' }}>
            Cookie (dias)
          </p>
          <span style={{ fontFamily: V.mono, fontSize: 24, fontWeight: 700, color: V.silver }}>
            {p.cookieDays || 180}
          </span>
        </div>
      </div>
    </div>
  );

  /* ── TAB: Cupons ── */
  const renderCupons = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: V.silver, fontFamily: V.font }}>
          Cupons ({totalCoupons})
        </h3>
        <button onClick={() => setShowNewCoupon(true)} style={btnPrimary}>
          <Ico d={IC.plus} size={14} color="#fff" /> Novo Cupom
        </button>
      </div>

      {showNewCoupon && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Codigo" value={newCouponCode} onChange={setNewCouponCode} placeholder="DESCONTO10" mono />
            <Field label="Desconto (%)" value={newCouponDiscount} onChange={setNewCouponDiscount} type="number" placeholder="10" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={handleCreateCoupon} style={btnPrimary}>Criar Cupom</button>
            <button onClick={() => setShowNewCoupon(false)} style={btnSecondary}>Cancelar</button>
          </div>
        </div>
      )}

      {couponsLoading ? (
        <p style={{ color: V.muted, fontFamily: V.font, fontSize: 13 }}>Carregando cupons...</p>
      ) : totalCoupons === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <Ico d={IC.tag} size={36} color={V.dim} />
          <p style={{ color: V.muted, fontFamily: V.font, fontSize: 14, marginTop: 12 }}>
            Nenhum cupom criado.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(coupons || []).map((c: any) => (
            <div key={c.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: V.yellowDim,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Ico d={IC.tag} size={18} color={V.yellow} />
                </div>
                <div>
                  <code style={{ fontSize: 14, fontWeight: 700, color: V.silver, fontFamily: V.mono }}>{c.code}</code>
                  <span style={{ display: 'block', fontSize: 12, color: V.muted, fontFamily: V.font, marginTop: 2 }}>
                    {c.discountPercent || c.discount || 0}% de desconto
                    {c.usageCount !== undefined ? ` · ${c.usageCount} usos` : ''}
                    {c.expiresAt ? ` · Expira: ${fmtDate(c.expiresAt)}` : ''}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={badgeStyle(c.active !== false ? V.greenDim : V.redDim, c.active !== false ? V.green : V.red)}>
                  {c.active !== false ? 'Ativo' : 'Expirado'}
                </span>
                <button
                  onClick={() => { if (confirm('Excluir cupom?')) deleteCoupon(c.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                >
                  <Ico d={IC.trash} size={14} color={V.red} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ── TAB: Avaliacoes ── */
  const renderAvaliacoes = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: V.silver, fontFamily: V.font }}>
          Avaliacoes ({totalReviews})
        </h3>
        {totalReviews > 0 && (
          <span style={badgeStyle(V.yellowDim, V.yellow)}>
            <Ico d={IC.star} size={12} color={V.yellow} />
            {avgRating.toFixed(1)} media
          </span>
        )}
      </div>

      {reviewsLoading ? (
        <p style={{ color: V.muted, fontFamily: V.font, fontSize: 13 }}>Carregando avaliacoes...</p>
      ) : totalReviews === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <Ico d={IC.star} size={36} color={V.dim} />
          <p style={{ color: V.muted, fontFamily: V.font, fontSize: 14, marginTop: 12 }}>
            Nenhuma avaliacao recebida.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reviews.map((r: any, i: number) => (
            <div key={r.id || i} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: V.emberGhost,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    color: V.ember,
                    fontFamily: V.font,
                  }}>
                    {(r.author || r.name || 'A').charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: V.silver, fontFamily: V.font }}>
                    {r.author || r.name || 'Anonimo'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Ico
                      key={si}
                      d={IC.star}
                      size={14}
                      color={si < (r.rating || 0) ? V.yellow : V.border}
                    />
                  ))}
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: V.muted, fontFamily: V.font, lineHeight: 1.5 }}>
                {r.comment || r.text || r.content || '--'}
              </p>
              {r.createdAt && (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: V.dim, fontFamily: V.font }}>
                  {fmtDate(r.createdAt)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ── TAB: IA Config ── */
  const renderIa = () => (
    <div>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: V.silver, fontFamily: V.font }}>
        Configuracao de IA
      </h3>
      <div style={card}>
        <Field
          label="Prompt do sistema"
          value={iaPrompt}
          onChange={setIaPrompt}
          placeholder="Voce e um assistente especializado neste produto..."
          rows={6}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Tom de voz</label>
            <select
              value={iaTone}
              onChange={(e) => setIaTone(e.target.value)}
              style={inputStyle}
            >
              <option value="profissional">Profissional</option>
              <option value="casual">Casual</option>
              <option value="tecnico">Tecnico</option>
              <option value="persuasivo">Persuasivo</option>
              <option value="amigavel">Amigavel</option>
            </select>
          </div>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-end', paddingBottom: 14 }}>
            <Toggle checked={iaAutoReply} onChange={setIaAutoReply} label="Auto-resposta habilitada" />
          </div>
        </div>
        <hr style={dividerStyle} />
        <div style={{ ...card, background: V.elevated, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ico d={IC.brain} size={16} color={V.ember} />
            <span style={{ fontSize: 13, fontWeight: 600, color: V.silver, fontFamily: V.font }}>Inteligencia contextual</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: V.muted, fontFamily: V.font, lineHeight: 1.6 }}>
            A IA utiliza automaticamente os dados do produto, planos, historico de avaliacoes e FAQs
            para responder perguntas de leads e clientes. Configure o prompt acima para personalizar
            o comportamento.
          </p>
        </div>
        <button style={btnPrimary}>
          <Ico d={IC.save} size={14} color="#fff" /> Salvar Configuracao IA
        </button>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════
     TAB CONTENT ROUTER
     ═══════════════════════════════════════════════════ */
  const renderTabContent = () => {
    switch (tab) {
      case 'dados': return renderDados();
      case 'planos': return renderPlanos();
      case 'checkouts': return renderCheckouts();
      case 'urls': return renderUrls();
      case 'comissao': return renderComissao();
      case 'cupons': return renderCupons();
      case 'avaliacoes': return renderAvaliacoes();
      case 'campanhas': return (<div style={{ padding: 24, ...card }}><h3 style={{ fontSize: 16, fontWeight: 600, color: V.silver, margin: '0 0 12px' }}>Campanhas</h3><p style={{ fontSize: 12, color: V.muted }}>Gerencie campanhas de rastreamento vinculadas a este produto.</p><div style={{ marginTop: 16, padding: 20, textAlign: 'center' as const, border: `1px dashed ${V.border}`, borderRadius: 6 }}><span style={{ fontSize: 10, color: V.dim }}>Nenhuma campanha criada</span></div></div>);
      case 'afterpay': return (<div style={{ padding: 24, ...card }}><h3 style={{ fontSize: 16, fontWeight: 600, color: V.silver, margin: '0 0 16px' }}>After Pay</h3><div style={{ marginBottom: 12 }}><span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: V.dim, letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Provedor logistico</span><select style={inputStyle}><option>Selecione</option></select></div></div>);
      case 'ia': return renderIa();
      default: return null;
    }
  };

  /* ═══════════════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: V.void, fontFamily: V.font }}>
      {/* ── HERO HEADER ── */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${V.border}` }}>
        <NeuralPulse height={160} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1152, margin: '0 auto', padding: '28px 24px 24px' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <button
              onClick={() => router.push('/products')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'none',
                border: 'none',
                color: V.muted,
                fontSize: 13,
                fontFamily: V.font,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 6,
                transition: 'color .15s',
              }}
            >
              <Ico d={IC.back} size={16} color={V.muted} />
              Voltar
            </button>
            <span style={{ color: V.dim, fontSize: 13 }}>/</span>
            <span style={{ color: V.muted, fontSize: 13 }}>Produto</span>
          </div>

          {/* Product title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Product image / placeholder */}
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                background: p.imageUrl ? `url(${p.imageUrl}) center/cover` : V.elevated,
                border: `1px solid ${V.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {!p.imageUrl && <Ico d={IC.box} size={28} color={V.dim} />}
              </div>

              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: V.silver, fontFamily: V.font }}>
                  {p.name || 'Produto sem nome'}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <code style={{ fontFamily: V.mono, fontSize: 11, color: V.dim, background: V.elevated, padding: '2px 8px', borderRadius: 4 }}>
                    {productId?.slice(0, 12)}...
                  </code>
                  <span style={badgeStyle(p.active !== false ? V.greenDim : V.redDim, p.active !== false ? V.green : V.red)}>
                    {p.active !== false ? 'Ativo' : 'Inativo'}
                  </span>
                  {p.category && (
                    <span style={badgeStyle(V.emberDim, V.ember)}>{p.category}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats badges */}
            <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
              <div style={{ textAlign: 'center', padding: '8px 16px', background: V.surface, borderRadius: 10, border: `1px solid ${V.border}` }}>
                <Ticker value={totalPlans} />
                <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: V.muted, fontFamily: V.font }}>Planos</p>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 16px', background: V.surface, borderRadius: 10, border: `1px solid ${V.border}` }}>
                <Ticker value={totalCoupons} />
                <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: V.muted, fontFamily: V.font }}>Cupons</p>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 16px', background: V.surface, borderRadius: 10, border: `1px solid ${V.border}` }}>
                <Ticker value={avgRating} decimals={1} />
                <p style={{ margin: '2px 0 0', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: V.muted, fontFamily: V.font }}>Rating</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TAB NAV + CONTENT ── */}
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ marginTop: 20, marginBottom: 24 }}>
          <TabNav active={tab} onChange={setTab} />
        </div>

        <div style={{ ...card, padding: 28, marginBottom: 48 }}>
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
