'use client';

import type * as React from 'react';
import PixelTracker, { type PixelConfig } from './PixelTracker';
import { useCheckoutExperience } from '../hooks/useCheckoutExperience';

type CheckoutTestimonial = {
  name?: string;
  text?: string;
  rating?: number;
  stars?: number;
  avatar?: string;
};

interface CheckoutConfig {
  theme?: 'NOIR' | 'BLANC';
  brandName?: string;
  brandLogo?: string;
  headerMessage?: string;
  headerSubMessage?: string;
  productImage?: string;
  productDisplayName?: string;
  btnStep1Text?: string;
  btnStep2Text?: string;
  btnFinalizeText?: string;
  requireCPF?: boolean;
  requirePhone?: boolean;
  phoneLabel?: string;
  enableCreditCard?: boolean;
  enablePix?: boolean;
  enableBoleto?: boolean;
  enableCoupon?: boolean;
  showCouponPopup?: boolean;
  couponPopupDelay?: number;
  couponPopupTitle?: string;
  couponPopupDesc?: string;
  couponPopupBtnText?: string;
  couponPopupDismiss?: string;
  autoCouponCode?: string;
  enableTestimonials?: boolean;
  testimonials?: CheckoutTestimonial[];
  footerText?: string;
  showPaymentIcons?: boolean;
  pixels?: PixelConfig[];
}

interface Product {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
}

interface Plan {
  id: string;
  name: string;
  priceInCents: number;
  compareAtPrice?: number;
  currency?: string;
  maxInstallments?: number;
  installmentsFee?: boolean;
  quantity?: number;
  freeShipping?: boolean;
  shippingPrice?: number;
}

interface MerchantInfo {
  workspaceId?: string;
  workspaceName?: string;
  companyName?: string;
  brandLogo?: string | null;
  customDomain?: string | null;
  cnpj?: string | null;
  addressLine?: string | null;
}

interface CheckoutNoirProps {
  product?: Product;
  config?: CheckoutConfig;
  plan?: Plan;
  slug?: string;
  workspaceId?: string;
  checkoutCode?: string;
  paymentProvider?: {
    provider: 'mercado_pago';
    connected: boolean;
    checkoutEnabled: boolean;
    publicKey?: string | null;
    unavailableReason?: string | null;
    installmentInterestMonthlyPercent?: number;
    supportsCreditCard?: boolean;
    supportsPix?: boolean;
    supportsBoleto?: boolean;
  };
  affiliateContext?: {
    affiliateLinkId?: string;
    affiliateWorkspaceId?: string;
    affiliateProductId?: string;
    affiliateCode?: string;
    commissionPct?: number;
  } | null;
  merchant?: MerchantInfo;
}

const DEFAULT_PRODUCT = { name: 'Produto', priceInCents: 0, brand: 'Kloel' };

const DEFAULT_TESTIMONIALS = [
  {
    name: 'Patrícia Almeida',
    stars: 5,
    text: 'Eu já tinha testado de tudo contra os calorões e nada resolvia. MenoPlex foi a primeira coisa que realmente fez diferença.',
    avatar: 'PA',
  },
  {
    name: 'Simone Silva',
    stars: 5,
    text: 'Não precisava falar mas esse remédio salvou meu casamento. Parei de ficar irritada e minha libido melhorou. Só compro 6 agora, quero meu desconto.',
    avatar: 'SS',
  },
  {
    name: 'Fátima Pereira',
    stars: 5,
    text: 'Eu adorei o envio deles, chegou super rápido. Produtos lindos e caixa personalizada.',
    avatar: 'FP',
  },
];

const PAYMENT_BADGES = [
  'AMEX',
  'VISA',
  'Diners',
  'Master',
  'Discover',
  'Aura',
  'Elo',
  'Pix',
  'Boleto',
];

const C = {
  void: '#0a0a0f',
  surface: '#12121a',
  surface2: '#1a1a25',
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.1)',
  text: '#e8e8ed',
  text2: 'rgba(255,255,255,0.55)',
  text3: 'rgba(255,255,255,0.3)',
  accent: '#D4A574',
  accent2: '#E8C4A0',
  green: '#10b981',
} as const;

const fmt = {
  cpf: (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.length <= 3
      ? d
      : d.length <= 6
        ? `${d.slice(0, 3)}.${d.slice(3)}`
        : d.length <= 9
          ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
          : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  },
  phone: (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.length <= 2
      ? d
      : d.length <= 7
        ? `(${d.slice(0, 2)}) ${d.slice(2)}`
        : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },
  cep: (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
  },
  card: (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 16);
    return d.match(/.{1,4}/g)?.join(' ') || d;
  },
  exp: (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
  },
  brl: (cents: number) =>
    (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
};

const clampQty = (value: number) => Math.min(Math.max(1, Math.round(value || 1)), 99);

const StepBubble = ({
  n,
  state,
  onClick,
  label,
}: {
  n: number;
  state: 'active' | 'done' | 'locked';
  onClick: () => void;
  label: string;
}) => (
  <button
    onClick={onClick}
    style={{
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: state === 'locked' ? 'default' : 'pointer',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      opacity: state === 'locked' ? 0.35 : 1,
      transition: 'opacity 0.3s',
    }}
  >
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: state === 'done' ? C.green : state === 'active' ? C.accent : C.surface2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.35s cubic-bezier(.4,0,.2,1)',
        boxShadow: state === 'active' ? '0 2px 12px rgba(212,165,116,0.3)' : 'none',
      }}
    >
      {state === 'done' ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{n}</span>
      )}
    </div>
    <span
      style={{
        fontSize: 11,
        fontWeight: state === 'active' ? 700 : 500,
        color: state === 'active' ? C.text : C.text3,
        textAlign: 'center',
        lineHeight: 1.3,
        maxWidth: 80,
      }}
    >
      {label}
    </span>
  </button>
);

const StepLine = ({ active }: { active: boolean }) => (
  <div
    style={{
      flex: 1,
      height: 2,
      background: active ? C.green : C.border2,
      transition: 'background 0.4s',
      marginTop: 17,
    }}
  />
);

const Chk = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#10b981"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const Star = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#FBBF24" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const Ed = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.text3}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const ChDown = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChUp = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const Mn = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const Pl = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const Px = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6.5 6.5L12 12m0 0l5.5 5.5M12 12l5.5-5.5M12 12L6.5 17.5" />
  </svg>
);

const Bc = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 8v8M10 8v8M14 8v8M17 8v8" />
  </svg>
);

const Cc = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const Tag = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.text3}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

function buildAvatar(name?: string) {
  const base = String(name || '').trim();
  if (!base) return 'KL';
  const parts = base.split(/\s+/);
  return (parts[0]?.[0] || 'K') + (parts[1]?.[0] || parts[0]?.[1] || 'L');
}

function normalizeTestimonials(
  brandName: string,
  testimonials?: CheckoutTestimonial[],
  enabled?: boolean,
) {
  if (enabled === false) return [];
  if (Array.isArray(testimonials) && testimonials.length > 0) {
    return testimonials.slice(0, 3).map((item) => ({
      name: item.name || 'Cliente',
      stars: Number(item.rating || item.stars || 5),
      text: item.text || `Comprei ${brandName} e a experiência foi excelente.`,
      avatar: item.avatar || buildAvatar(item.name),
    }));
  }
  return DEFAULT_TESTIMONIALS;
}

function formatCnpj(value?: string | null) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 14);
  if (digits.length !== 14) return value || '';
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function buildFooterPrimaryLine(brandName: string, merchant?: MerchantInfo) {
  const domain = String(merchant?.customDomain || '')
    .trim()
    .replace(/^https?:\/\//, '');
  return `${brandName}: ${domain || 'pay.kloel.com'}`;
}

function ValidationInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  style = {},
}: {
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '13px 38px 13px 16px',
          background: C.surface2,
          border: `1px solid ${C.border2}`,
          borderRadius: 6,
          color: C.text,
          fontSize: 15,
          fontFamily: "'DM Sans', sans-serif",
          transition: 'border-color 0.2s, box-shadow 0.2s',
          outline: 'none',
          ...style,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = C.accent;
          e.target.style.boxShadow = '0 0 0 2px rgba(212,165,116,0.15)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = C.border2;
          e.target.style.boxShadow = 'none';
        }}
      />
      {value.trim() && (
        <span
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}
        >
          <Chk />
        </span>
      )}
    </div>
  );
}

export default function CheckoutNoir({
  product,
  config,
  plan,
  workspaceId,
  checkoutCode,
  paymentProvider,
  affiliateContext,
  merchant,
}: CheckoutNoirProps) {
  const {
    step,
    setStep,
    summaryOpen,
    setSummaryOpen,
    couponCode,
    setCouponCode,
    couponApplied,
    discount,
    payMethod,
    setPayMethod,
    showSuccess,
    successOrderNumber,
    qty,
    setQty,
    loadingStep,
    isSubmitting,
    couponError,
    showCouponPopup,
    setShowCouponPopup,
    setCouponPopupHandled,
    submitError,
    pixelEvent,
    form,
    productName,
    brandName,
    unitPriceInCents,
    shippingInCents,
    supportsCard,
    supportsPix,
    supportsBoleto,
    productImage,
    checkoutUnavailableReason,
    testimonials,
    pixels,
    subtotal,
    total,
    pricing,
    totalWithInterest,
    installmentOptions,
    footerPrimary,
    footerSecondary,
    footerLegal,
    mobileCanOpenStep1,
    mobileCanOpenStep2,
    headerPrimary,
    headerSecondary,
    popupCouponCode,
    updateField,
    goStep,
    applyCoupon,
    finalizeOrder,
  } = useCheckoutExperience({
    product,
    config,
    plan,
    workspaceId,
    checkoutCode,
    paymentProvider,
    affiliateContext,
    merchant,
    defaults: {
      product: DEFAULT_PRODUCT,
      testimonials: DEFAULT_TESTIMONIALS,
    },
    helpers: {
      fmt,
      normalizeTestimonials,
      buildFooterPrimaryLine,
      formatCnpj,
    },
  });

  const L: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: C.text2,
    marginBottom: 6,
  };

  const activeCard: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border2}`,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: '24px 20px',
    animation: 'fadeIn 0.3s',
  };

  const doneCard: React.CSSProperties = {
    background: 'rgba(16,185,129,0.04)',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: 20,
  };

  const lockedCard: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '24px 20px',
    opacity: 0.35,
  };

  const numDone: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: C.green,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const numActive: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: C.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const numLock: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: C.surface2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const renderProductThumb = (size = 72) =>
    productImage ? (
      <img
        src={productImage}
        alt={productName}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
          background: C.surface2,
        }}
      />
    ) : (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: C.surface2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 32,
        }}
      >
        📦
      </div>
    );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.void,
        fontFamily: "'DM Sans',sans-serif",
        color: C.text,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box}button{cursor:pointer}input::placeholder{color:rgba(255,255,255,0.2)!important}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes modalIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}.ck-mobile-only{display:none}@media(max-width:900px){.ck-main{flex-direction:column!important}.ck-col{flex:1 1 100%!important;min-width:0!important}.ck-mobile-only{display:block!important}.ck-desktop-only{display:none!important}.ck-lock-text{display:none!important}}`}</style>

      {pixelEvent && pixels.length > 0 ? <PixelTracker pixels={pixels} event={pixelEvent} /> : null}

      <header
        style={{
          background: 'linear-gradient(135deg,#1a0a14,#2d1525,#1a0a14)',
          padding: '22px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 300,
              color: '#fff',
              letterSpacing: '0.02em',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            {brandName}
          </div>
          <div
            style={{
              position: 'absolute',
              right: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#fff',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="rgba(255,255,255,0.7)"
              stroke="none"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path
                d="M7 11V7a5 5 0 0110 0v4"
                fill="none"
                stroke="rgba(255,255,255,0.7)"
                strokeWidth="2"
              />
            </svg>
            <div className="ck-lock-text">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  lineHeight: 1.1,
                  color: '#fff',
                }}
              >
                PAGAMENTO
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 400,
                  letterSpacing: '0.1em',
                  lineHeight: 1.5,
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                100% SEGURO
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        style={{
          background: C.surface,
          padding: '10px 24px',
          textAlign: 'center',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{headerPrimary}</div>
        <div style={{ fontSize: 13, color: C.text2 }}>{headerSecondary}</div>
      </div>

      <div
        style={{
          maxWidth: 500,
          margin: '24px auto 0',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'flex-start',
        }}
      >
        <StepBubble
          n={1}
          state={step === 1 ? 'active' : step > 1 ? 'done' : 'locked'}
          onClick={() => {
            if (mobileCanOpenStep1) goStep(1);
          }}
          label="Informações pessoais"
        />
        <StepLine active={step > 1} />
        <StepBubble
          n={2}
          state={step === 2 ? 'active' : step > 2 ? 'done' : 'locked'}
          onClick={() => {
            if (mobileCanOpenStep2) goStep(2);
          }}
          label="Entrega"
        />
        <StepLine active={step > 2} />
        <StepBubble
          n={3}
          state={step >= 3 ? 'active' : 'locked'}
          onClick={() => undefined}
          label="Pagamento"
        />
      </div>

      <div
        className="ck-mobile-only"
        style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 16px' }}
      >
        <div
          style={{
            background: C.surface,
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            border: `1px solid ${C.border}`,
          }}
        >
          <button
            onClick={() => setSummaryOpen((value) => !value)}
            style={{
              width: '100%',
              padding: '16px 20px',
              background: 'transparent',
              border: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: C.text,
            }}
          >
            <div>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>
                RESUMO ({qty})
              </span>
              <br />
              <span style={{ fontSize: 12, color: C.text3, fontWeight: 400 }}>
                Informações da sua compra
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: C.text3 }}>
                {fmt.brl(totalWithInterest)}
              </span>
              {summaryOpen ? <ChUp /> : <ChDown />}
            </div>
          </button>
          {summaryOpen ? (
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 6 }}>
                {renderProductThumb(72)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 400,
                      color: C.text3,
                      lineHeight: 1.4,
                      marginBottom: 4,
                    }}
                  >
                    {productName}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                    {fmt.brl(unitPriceInCents)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: C.surface2,
                    borderRadius: 24,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setQty((value) => clampQty(value - 1))}
                    style={{
                      padding: '10px 22px',
                      background: 'transparent',
                      border: 'none',
                      color: C.text3,
                      fontSize: 18,
                    }}
                  >
                    <Mn />
                  </button>
                  <span
                    style={{ padding: '10px 24px', fontSize: 17, fontWeight: 700, color: C.text }}
                  >
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty((value) => clampQty(value + 1))}
                    style={{
                      padding: '10px 22px',
                      background: 'transparent',
                      border: 'none',
                      color: C.text3,
                      fontSize: 18,
                    }}
                  >
                    <Pl />
                  </button>
                </div>
              </div>
              <div style={{ height: 1, background: C.border, marginBottom: 16 }} />
              {config?.enableCoupon !== false ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                    Tem um cupom?
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '0 14px',
                        border: `1px solid ${C.border2}`,
                        borderRadius: 24,
                        background: C.surface2,
                        minWidth: 0,
                      }}
                    >
                      <Tag />
                      <input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="Código do cupom"
                        style={{
                          flex: 1,
                          padding: '12px 0',
                          border: 'none',
                          fontSize: 14,
                          outline: 'none',
                          background: 'transparent',
                          color: C.text,
                          fontFamily: "'DM Sans',sans-serif",
                          minWidth: 0,
                        }}
                      />
                    </div>
                    <button
                      onClick={() => void applyCoupon()}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.accent,
                        fontSize: 15,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      Aplicar
                    </button>
                  </div>
                  {couponError ? (
                    <div style={{ fontSize: 12, color: '#d14343', marginBottom: 10 }}>
                      {couponError}
                    </div>
                  ) : null}
                </>
              ) : null}
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  padding: '16px 18px',
                  borderLeft: `3px solid ${C.accent}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.text,
                    marginBottom: 8,
                  }}
                >
                  <span>Produtos</span>
                  <span>{fmt.brl(subtotal)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.text,
                    marginBottom: 8,
                  }}
                >
                  <span>Frete</span>
                  <span>{shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}</span>
                </div>
                {couponApplied ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 15,
                      color: C.green,
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    <span>Desconto</span>
                    <span>-{fmt.brl(discount)}</span>
                  </div>
                ) : null}
                {payMethod === 'card' && pricing.installmentInterestInCents > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 15,
                      color: C.accent,
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    <span>Juros do parcelamento</span>
                    <span>{fmt.brl(pricing.installmentInterestInCents)}</span>
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  <span style={{ fontSize: 15, color: C.accent, fontWeight: 400 }}>Total</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>
                    {fmt.brl(totalWithInterest)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <main
        className="ck-main"
        style={{
          maxWidth: 1200,
          margin: '20px auto 40px',
          padding: '0 24px',
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
          {step > 1 ? (
            <div style={doneCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={numDone}>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>1</span>
                </div>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Identificação</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.green}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <button
                  onClick={() => setStep(1)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 4 }}
                >
                  <Ed />
                </button>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                {form.name || 'Nome'}
              </div>
              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>
                {form.email}
                <br />
                CPF {form.cpf}
              </div>
            </div>
          ) : (
            <div style={activeCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={numActive}>
                  <span style={{ color: C.void, fontSize: 13, fontWeight: 700 }}>1</span>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>Identificação</h2>
              </div>
              <p style={{ fontSize: 13, color: C.text2, marginBottom: 20, lineHeight: 1.5 }}>
                Utilizaremos seu e-mail para: Identificar seu perfil, histórico de compra,
                notificação de pedidos e carrinho de compras.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label htmlFor="checkout-name" style={L}>
                    Nome completo
                  </label>
                  <ValidationInput
                    id="checkout-name"
                    value={form.name}
                    onChange={updateField('name')}
                    placeholder="ex.: Maria de Almeida Cruz"
                  />
                </div>
                <div>
                  <label htmlFor="checkout-email" style={L}>
                    E-mail
                  </label>
                  <ValidationInput
                    id="checkout-email"
                    value={form.email}
                    onChange={updateField('email')}
                    placeholder="ex.: maria@gmail.com"
                    type="email"
                  />
                </div>
                <div style={{ width: 'fit-content', minWidth: 220 }}>
                  <label htmlFor="checkout-cpf" style={L}>
                    CPF
                  </label>
                  <ValidationInput
                    id="checkout-cpf"
                    value={form.cpf}
                    onChange={updateField('cpf')}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label htmlFor="checkout-phone" style={L}>
                    {config?.phoneLabel || 'Celular / WhatsApp'}
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 14px',
                        background: C.surface2,
                        border: `1px solid ${C.border2}`,
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        color: C.text2,
                        flexShrink: 0,
                      }}
                    >
                      +55
                    </div>
                    <div style={{ flex: 1 }}>
                      <ValidationInput
                        id="checkout-phone"
                        value={form.phone}
                        onChange={updateField('phone')}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                </div>
              </div>
              {submitError && step === 1 ? (
                <div style={{ marginTop: 14, fontSize: 13, color: '#d14343' }}>{submitError}</div>
              ) : null}
              <button
                onClick={() => goStep(2)}
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: 15,
                  background: C.accent,
                  border: 'none',
                  borderRadius: 6,
                  color: C.void,
                  fontSize: 17,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(212,165,116,0.2)',
                }}
              >
                {loadingStep ? (
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      border: '2px solid rgba(0,0,0,0.2)',
                      borderTopColor: C.void,
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }}
                  />
                ) : (
                  config?.btnStep1Text || 'Ir para Entrega'
                )}
              </button>
            </div>
          )}

          {step >= 2 ? (
            step > 2 ? (
              <div style={{ ...doneCard, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={numDone}>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>2</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Entrega</span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.green}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <button
                    onClick={() => setStep(2)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 4 }}
                  >
                    <Ed />
                  </button>
                </div>
                <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>
                  <strong style={{ color: C.text }}>Endereço para entrega:</strong>
                  <br />
                  {form.street || 'Endereço'}, {form.number || 'S/N'} - {form.neighborhood}
                  <br />
                  {form.complement ? (
                    <>
                      Complemento: {form.complement}
                      <br />
                    </>
                  ) : null}
                  {[form.city, form.state].filter(Boolean).join(' - ')} | CEP {form.cep}
                  <br />
                  <strong style={{ display: 'block', marginTop: 8, color: C.text }}>
                    Forma de entrega:
                  </strong>
                  {shippingInCents === 0
                    ? 'Frete padrão Grátis'
                    : `Frete padrão ${fmt.brl(shippingInCents)}`}
                </div>
              </div>
            ) : (
              <div style={{ ...activeCard, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <div style={numActive}>
                    <span style={{ color: C.void, fontSize: 13, fontWeight: 700 }}>2</span>
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 700 }}>Entrega</h2>
                </div>
                <p style={{ fontSize: 13, color: C.text2, marginBottom: 16 }}>
                  Cadastre ou selecione um endereço
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ minWidth: 180 }}>
                      <label htmlFor="checkout-cep" style={L}>
                        CEP
                      </label>
                      <ValidationInput
                        id="checkout-cep"
                        value={form.cep}
                        onChange={updateField('cep')}
                        placeholder="00000-000"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="checkout-street" style={L}>
                      Endereço
                    </label>
                    <ValidationInput
                      id="checkout-street"
                      value={form.street}
                      onChange={updateField('street')}
                      placeholder="Rua, avenida..."
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: '0 0 35%' }}>
                      <label htmlFor="checkout-number" style={L}>
                        Número
                      </label>
                      <ValidationInput
                        id="checkout-number"
                        value={form.number}
                        onChange={updateField('number')}
                        placeholder="Nº"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label htmlFor="checkout-neighborhood" style={L}>
                        Bairro
                      </label>
                      <ValidationInput
                        id="checkout-neighborhood"
                        value={form.neighborhood}
                        onChange={updateField('neighborhood')}
                        placeholder="Bairro"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="checkout-complement" style={L}>
                      Complemento <span style={{ opacity: 0.4, fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <ValidationInput
                      id="checkout-complement"
                      value={form.complement}
                      onChange={updateField('complement')}
                      placeholder="Apto, bloco..."
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label htmlFor="checkout-city" style={L}>
                        Cidade
                      </label>
                      <ValidationInput
                        id="checkout-city"
                        value={form.city}
                        onChange={updateField('city')}
                        placeholder="Cidade"
                      />
                    </div>
                    <div style={{ flex: '0 0 24%' }}>
                      <label htmlFor="checkout-state" style={L}>
                        UF
                      </label>
                      <ValidationInput
                        id="checkout-state"
                        value={form.state}
                        onChange={updateField('state')}
                        placeholder="UF"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="checkout-destinatario" style={L}>
                      Destinatário
                    </label>
                    <ValidationInput
                      id="checkout-destinatario"
                      value={form.destinatario}
                      onChange={updateField('destinatario')}
                      placeholder="Nome do destinatário"
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    marginTop: 18,
                    border: `1px solid ${C.border2}`,
                    borderRadius: 6,
                    background: C.surface2,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `5px solid ${C.accent}`,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Frete padrão</div>
                    <div style={{ fontSize: 12, color: C.text3 }}>Entrega garantida</div>
                  </div>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: shippingInCents === 0 ? C.green : C.text,
                    }}
                  >
                    {shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}
                  </span>
                </div>
                {submitError && step === 2 ? (
                  <div style={{ marginTop: 14, fontSize: 13, color: '#d14343' }}>{submitError}</div>
                ) : null}
                <button
                  onClick={() => goStep(3)}
                  style={{
                    width: '100%',
                    marginTop: 18,
                    padding: 15,
                    background: C.accent,
                    border: 'none',
                    borderRadius: 6,
                    color: C.void,
                    fontSize: 17,
                    fontWeight: 700,
                    boxShadow: '0 4px 16px rgba(212,165,116,0.2)',
                  }}
                >
                  {config?.btnStep2Text || 'Ir para Pagamento'}
                </button>
              </div>
            )
          ) : (
            <div style={{ ...lockedCard, marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={numLock}>
                  <span style={{ color: C.text3, fontSize: 13, fontWeight: 700 }}>2</span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text3 }}>Entrega</h2>
              </div>
              <p style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
                Preencha suas informações pessoais para continuar
              </p>
            </div>
          )}
        </div>

        <div className="ck-col" style={{ flex: '0 0 34%', minWidth: 280 }}>
          {step >= 3 ? (
            <div style={activeCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={numActive}>
                  <span style={{ color: C.void, fontSize: 13, fontWeight: 700 }}>3</span>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>Pagamento</h2>
              </div>
              <p style={{ fontSize: 13, color: C.text2, marginBottom: 16 }}>
                Escolha uma forma de pagamento
              </p>

              {checkoutUnavailableReason ? (
                <div
                  style={{
                    marginBottom: 14,
                    padding: '12px 14px',
                    background: 'rgba(127,29,29,0.12)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#fecaca',
                    lineHeight: 1.5,
                  }}
                >
                  {checkoutUnavailableReason}
                </div>
              ) : null}

              {supportsCard ? (
                <div
                  onClick={() => setPayMethod('card')}
                  style={{
                    border: `1px solid ${payMethod === 'card' ? C.accent : C.border2}`,
                    borderRadius: 6,
                    padding: '16px 18px',
                    marginBottom: 12,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: payMethod === 'card' ? 16 : 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border:
                          payMethod === 'card' ? `5px solid ${C.accent}` : `2px solid ${C.border2}`,
                        transition: 'border 0.2s',
                      }}
                    />
                    <Cc />
                    <span style={{ fontSize: 15, fontWeight: 600 }}>Cartão de crédito</span>
                  </div>
                  {payMethod === 'card' ? (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                        {PAYMENT_BADGES.filter((item) => item !== 'Pix' && item !== 'Boleto').map(
                          (brand) => (
                            <span
                              key={brand}
                              style={{
                                padding: '3px 8px',
                                background: C.surface2,
                                border: `1px solid ${C.border}`,
                                borderRadius: 4,
                                fontSize: 9,
                                fontWeight: 700,
                                color: C.text3,
                              }}
                            >
                              {brand}
                            </span>
                          ),
                        )}
                      </div>
                      <div
                        style={{
                          background: `linear-gradient(135deg,${C.surface2},#2a2a3d)`,
                          borderRadius: 6,
                          padding: 18,
                          color: '#fff',
                          fontFamily: 'monospace',
                          marginBottom: 16,
                          minHeight: 150,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 24,
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.15)',
                          }}
                        />
                        <div
                          style={{
                            display: 'flex',
                            gap: 14,
                            fontSize: 16,
                            letterSpacing: '0.12em',
                            margin: '14px 0',
                          }}
                        >
                          {[0, 1, 2, 3].map((group) => (
                            <span key={group}>{form.cardNumber.split(' ')[group] || '••••'}</span>
                          ))}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}
                        >
                          <span>{form.cardName || 'NOME E SOBRENOME'}</span>
                          <span>
                            <span style={{ fontSize: 8 }}>validade</span> {form.cardExp || '••/••'}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <label htmlFor="checkout-card-number" style={L}>
                            Número do cartão
                          </label>
                          <ValidationInput
                            id="checkout-card-number"
                            value={form.cardNumber}
                            onChange={updateField('cardNumber')}
                            placeholder="1234 1234 1234 1234"
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <label htmlFor="checkout-card-exp" style={L}>
                              Validade <span style={{ opacity: 0.4 }}>(mês/ano)</span>
                            </label>
                            <ValidationInput
                              id="checkout-card-exp"
                              value={form.cardExp}
                              onChange={updateField('cardExp')}
                              placeholder="MM/AA"
                            />
                          </div>
                          <div style={{ flex: '0 0 38%' }}>
                            <label htmlFor="checkout-card-cvv" style={L}>
                              Cód. de segurança
                            </label>
                            <ValidationInput
                              id="checkout-card-cvv"
                              value={form.cardCvv}
                              onChange={updateField('cardCvv')}
                              placeholder="•••"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="checkout-card-name" style={L}>
                            Nome e sobrenome do titular
                          </label>
                          <ValidationInput
                            id="checkout-card-name"
                            value={form.cardName}
                            onChange={updateField('cardName')}
                            placeholder="ex.: Maria de Almeida Cruz"
                          />
                        </div>
                        <div>
                          <label htmlFor="checkout-card-cpf" style={L}>
                            CPF do titular
                          </label>
                          <ValidationInput
                            id="checkout-card-cpf"
                            value={form.cardCpf}
                            onChange={updateField('cardCpf')}
                            placeholder="000.000.000-00"
                          />
                        </div>
                        <div>
                          <label htmlFor="checkout-installments" style={L}>
                            Nº de Parcelas
                          </label>
                          <select
                            id="checkout-installments"
                            value={form.installments}
                            onChange={updateField('installments')}
                            style={{
                              width: '100%',
                              padding: '13px 16px',
                              background: C.surface2,
                              border: `1px solid ${C.border2}`,
                              borderRadius: 6,
                              fontSize: 15,
                              color: C.text,
                              fontFamily: "'DM Sans',sans-serif",
                              outline: 'none',
                            }}
                          >
                            {installmentOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>
                            {pricing.installmentInterestInCents > 0
                              ? `Juros total do parcelamento: ${fmt.brl(pricing.installmentInterestInCents)}`
                              : 'Parcelamento sem juros na opção selecionada.'}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {supportsPix ? (
                <div
                  onClick={() => setPayMethod('pix')}
                  style={{
                    border: `1px solid ${payMethod === 'pix' ? C.accent : C.border2}`,
                    borderRadius: 6,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: payMethod === 'pix' ? 14 : 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border:
                          payMethod === 'pix' ? `5px solid ${C.accent}` : `2px solid ${C.border2}`,
                        transition: 'border 0.2s',
                      }}
                    />
                    <Px />
                    <span style={{ fontSize: 15, fontWeight: 600 }}>Pix</span>
                  </div>
                  {payMethod === 'pix' ? (
                    <>
                      <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 8 }}>
                        A confirmação de pagamento é realizada em poucos minutos. Utilize o
                        aplicativo do seu banco para pagar.
                      </p>
                      <div style={{ fontSize: 15, color: C.text3, marginBottom: 14 }}>
                        Valor no Pix: {fmt.brl(total)}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {supportsBoleto ? (
                <div
                  onClick={() => setPayMethod('boleto')}
                  style={{
                    border: `1px solid ${payMethod === 'boleto' ? C.accent : C.border2}`,
                    borderRadius: 6,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                    marginTop: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: payMethod === 'boleto' ? 14 : 0,
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border:
                          payMethod === 'boleto'
                            ? `5px solid ${C.accent}`
                            : `2px solid ${C.border2}`,
                        transition: 'border 0.2s',
                      }}
                    />
                    <Bc />
                    <span style={{ fontSize: 15, fontWeight: 600 }}>Boleto</span>
                  </div>
                  {payMethod === 'boleto' ? (
                    <>
                      <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 8 }}>
                        O boleto é gerado com código de barras e PDF prontos para pagamento logo
                        após a confirmação.
                      </p>
                      <div style={{ fontSize: 15, color: C.text3, marginBottom: 4 }}>
                        Valor no boleto: {fmt.brl(total)}
                      </div>
                      <div style={{ fontSize: 12, color: C.text3 }}>
                        Compensação bancária em até 3 dias úteis.
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {submitError ? (
                <div style={{ marginTop: 14, fontSize: 13, color: '#d14343', lineHeight: 1.5 }}>
                  {submitError}
                </div>
              ) : null}

              <button
                onClick={() => void finalizeOrder()}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: 16,
                  background: C.accent,
                  border: 'none',
                  borderRadius: 6,
                  color: C.void,
                  fontSize: 18,
                  fontWeight: 700,
                  opacity: isSubmitting ? 0.7 : 1,
                  boxShadow: '0 4px 16px rgba(212,165,116,0.2)',
                }}
              >
                {isSubmitting ? 'Processando...' : config?.btnFinalizeText || 'Finalizar compra'}
              </button>
            </div>
          ) : (
            <div style={lockedCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={numLock}>
                  <span style={{ color: C.text3, fontSize: 13, fontWeight: 700 }}>3</span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text3 }}>Pagamento</h2>
              </div>
              <p style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
                Preencha suas informações de entrega para continuar
              </p>
            </div>
          )}
        </div>

        <div className="ck-col ck-desktop-only" style={{ flex: '1 1 28%', minWidth: 260 }}>
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '24px 20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>RESUMO</h3>

            {config?.enableCoupon !== false ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                  Tem um cupom?
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0 14px',
                      border: `1px solid ${C.border2}`,
                      borderRadius: 24,
                      background: C.surface2,
                      minWidth: 0,
                    }}
                  >
                    <Tag />
                    <input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Código do cupom"
                      style={{
                        flex: 1,
                        padding: '12px 0',
                        border: 'none',
                        fontSize: 14,
                        outline: 'none',
                        background: 'transparent',
                        color: C.text,
                        fontFamily: "'DM Sans',sans-serif",
                        minWidth: 0,
                      }}
                    />
                  </div>
                  <button
                    onClick={() => void applyCoupon()}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: C.accent,
                      fontSize: 15,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Aplicar
                  </button>
                </div>
                {couponError ? (
                  <div style={{ fontSize: 12, color: '#d14343', marginBottom: 12 }}>
                    {couponError}
                  </div>
                ) : (
                  <div style={{ marginBottom: 12 }} />
                )}
              </>
            ) : null}

            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                padding: '16px 18px',
                marginBottom: 24,
                borderLeft: `3px solid ${C.accent}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 15,
                  fontWeight: 700,
                  color: C.text,
                  marginBottom: 8,
                }}
              >
                <span>Produtos</span>
                <span>{fmt.brl(subtotal)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 15,
                  fontWeight: 700,
                  color: C.text,
                  marginBottom: 8,
                }}
              >
                <span>Frete</span>
                <span>{shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}</span>
              </div>
              {couponApplied ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 15,
                    color: C.green,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  <span>Desconto</span>
                  <span>-{fmt.brl(discount)}</span>
                </div>
              ) : null}
              {payMethod === 'card' && pricing.installmentInterestInCents > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 15,
                    color: C.accent,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  <span>Juros</span>
                  <span>{fmt.brl(pricing.installmentInterestInCents)}</span>
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 4,
                }}
              >
                <span style={{ fontSize: 15, color: C.accent, fontWeight: 400 }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>
                  {fmt.brl(totalWithInterest)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              {renderProductThumb(72)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: C.text3,
                    lineHeight: 1.4,
                    marginBottom: 4,
                  }}
                >
                  {productName}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                  {fmt.brl(unitPriceInCents)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: C.surface2,
                    borderRadius: 24,
                    overflow: 'hidden',
                    width: 'fit-content',
                  }}
                >
                  <button
                    onClick={() => setQty((value) => clampQty(value - 1))}
                    style={{
                      padding: '8px 18px',
                      background: 'transparent',
                      border: 'none',
                      color: C.text3,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Mn />
                  </button>
                  <span
                    style={{ padding: '8px 20px', fontSize: 16, fontWeight: 700, color: C.text }}
                  >
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty((value) => clampQty(value + 1))}
                    style={{
                      padding: '8px 18px',
                      background: 'transparent',
                      border: 'none',
                      color: C.text3,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Pl />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {testimonials.map((testimonial, index) => (
            <div
              key={`${testimonial.name}-${index}`}
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: '16px 18px',
                marginTop: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: C.surface2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: C.text3,
                    flexShrink: 0,
                  }}
                >
                  {testimonial.avatar}
                </div>
                <div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                    {Array.from({ length: testimonial.stars }).map((_, starIndex) => (
                      <Star key={starIndex} />
                    ))}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{testimonial.name}</div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>{testimonial.text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer
        style={{
          background: C.void,
          borderTop: `1px solid ${C.border}`,
          padding: '40px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {config?.showPaymentIcons !== false ? (
            <>
              <div style={{ fontSize: 14, color: C.text3, marginBottom: 14 }}>
                Formas de pagamento
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 24,
                }}
              >
                {PAYMENT_BADGES.filter((item) => {
                  if (item === 'Pix') return supportsPix;
                  if (item === 'Boleto') return supportsBoleto;
                  return supportsCard;
                }).map((code) => (
                  <span
                    key={code}
                    style={{
                      padding: '6px 14px',
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.text3,
                    }}
                  >
                    {code}
                  </span>
                ))}
              </div>
            </>
          ) : null}
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 4 }}>{footerPrimary}</div>
          {footerSecondary ? (
            <div style={{ fontSize: 13, color: C.text3, marginBottom: 4 }}>{footerSecondary}</div>
          ) : null}
          <div style={{ fontSize: 13, color: C.text3, marginBottom: 20 }}>{footerLegal}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={C.text3} stroke="none">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" fill="none" stroke={C.text3} strokeWidth="2" />
            </svg>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.text2,
                  letterSpacing: '0.1em',
                  lineHeight: 1.1,
                }}
              >
                PAGAMENTO
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 400,
                  color: C.text3,
                  letterSpacing: '0.1em',
                  lineHeight: 1.5,
                }}
              >
                100% SEGURO
              </div>
            </div>
          </div>
        </div>
      </footer>

      {showCouponPopup ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(12,12,14,0.38)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: C.surface,
              borderRadius: 6,
              border: `1px solid ${C.border2}`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              padding: '28px 24px 22px',
              animation: 'modalIn 0.28s',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'linear-gradient(135deg,rgba(212,165,116,0.18),rgba(232,196,160,0.08))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
              }}
            >
              <Tag />
            </div>
            <h3 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8 }}>
              {config?.couponPopupTitle || 'Cupom exclusivo liberado'}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: C.text2, marginBottom: 18 }}>
              {config?.couponPopupDesc ||
                'Seu desconto já está pronto para ser aplicado neste pedido.'}
            </p>
            <div
              style={{
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: 'rgba(255,255,255,0.03)',
                padding: '14px 16px',
                marginBottom: 18,
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.text3,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Cupom pronto para aplicar
              </span>
              <span
                style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '.06em' }}
              >
                {popupCouponCode}
              </span>
            </div>
            {couponError ? (
              <div style={{ fontSize: 12, color: '#d14343', marginBottom: 12, lineHeight: 1.6 }}>
                {couponError}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  setShowCouponPopup(false);
                  setCouponPopupHandled(true);
                }}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 999,
                  border: `1px solid ${C.border2}`,
                  background: C.surface2,
                  color: C.text2,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {config?.couponPopupDismiss || 'Agora não'}
              </button>
              <button
                onClick={() => void applyCoupon(popupCouponCode)}
                style={{
                  flex: 1.25,
                  height: 48,
                  borderRadius: 999,
                  border: 'none',
                  background: C.accent,
                  color: C.void,
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                {config?.couponPopupBtnText || 'Aplicar cupom'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSuccess ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border2}`,
              borderRadius: 6,
              padding: '36px 32px',
              maxWidth: 400,
              width: '100%',
              textAlign: 'center',
              animation: 'modalIn 0.3s',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: C.green,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Pedido confirmado!</h3>
            <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6 }}>
              Seu pedido foi realizado com sucesso.
            </p>
            <div
              style={{
                marginTop: 16,
                padding: '10px 20px',
                background: 'rgba(16,185,129,0.08)',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                color: C.green,
                fontFamily: 'monospace',
              }}
            >
              {successOrderNumber || 'Pedido em processamento'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
