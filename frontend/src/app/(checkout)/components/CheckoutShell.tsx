'use client';

import React, { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/http';
import CheckoutNoir from './CheckoutNoir';
import CheckoutBlanc from './CheckoutBlanc';
import PixelTracker, { type PixelConfig } from './PixelTracker';
import { KloelBrandLockup } from '@/components/kloel/KloelBrand';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface CheckoutData {
  id: string;
  name: string;
  slug: string;
  priceInCents: number;
  compareAtPrice?: number;
  currency?: string;
  maxInstallments?: number;
  installmentsFee?: boolean;
  quantity?: number;
  freeShipping?: boolean;
  shippingPrice?: number;
  product: {
    id: string;
    name: string;
    description?: string;
    images?: string[];
    workspaceId?: string;
  };
  checkoutConfig?: {
    theme: 'NOIR' | 'BLANC';
    accentColor?: string;
    accentColor2?: string;
    backgroundColor?: string;
    cardColor?: string;
    textColor?: string;
    mutedTextColor?: string;
    fontBody?: string;
    fontDisplay?: string;
    brandName: string;
    brandLogo?: string;
    headerMessage?: string;
    headerSubMessage?: string;
    productImage?: string;
    productDisplayName?: string;
    btnStep1Text?: string;
    btnStep2Text?: string;
    btnFinalizeText?: string;
    btnFinalizeIcon?: string;
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
    enableTimer?: boolean;
    timerType?: 'COUNTDOWN' | 'EXPIRATION';
    timerMinutes?: number;
    timerMessage?: string;
    timerExpiredMessage?: string;
    timerPosition?: string;
    enableExitIntent?: boolean;
    exitIntentTitle?: string;
    exitIntentDescription?: string;
    exitIntentCouponCode?: string;
    enableFloatingBar?: boolean;
    floatingBarMessage?: string;
    enableTestimonials?: boolean;
    testimonials?: { name: string; text: string; rating: number; avatar?: string }[];
    enableGuarantee?: boolean;
    guaranteeTitle?: string;
    guaranteeText?: string;
    guaranteeDays?: number;
    enableTrustBadges?: boolean;
    trustBadges?: string[];
    footerText?: string;
    showPaymentIcons?: boolean;
    pixels?: PixelConfig[];
  };
  orderBumps?: {
    id: string;
    title: string;
    description: string;
    productName: string;
    image?: string;
    priceInCents: number;
    compareAtPrice?: number;
    highlightColor?: string;
    checkboxLabel?: string;
  }[];
  paymentProvider?: {
    provider: 'mercado_pago';
    connected: boolean;
    checkoutEnabled: boolean;
    publicKey?: string | null;
    unavailableReason?: string | null;
    marketplaceFeePercent?: number;
    installmentInterestMonthlyPercent?: number;
    availablePaymentMethodIds?: string[];
    availablePaymentMethodTypes?: string[];
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
  checkoutCode?: string;
}

interface CheckoutShellProps {
  slug: string;
  mode?: 'slug' | 'code';
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function CheckoutShell({ slug, mode = 'slug' }: CheckoutShellProps) {
  const [data, setData] = useState<CheckoutData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint =
      mode === 'code'
        ? `${API_BASE}/checkout/public/r/${slug}`
        : `${API_BASE}/checkout/public/${slug}`;

    fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error(`Checkout nao encontrado (${res.status})`);
        return res.json();
      })
      .then((json: CheckoutData) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug, mode]);

  /* ── Loading state ─────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0A0A0C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'center' }}>
            <KloelBrandLockup markSize={18} fontSize={15} fontWeight={600} />
          </div>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #2A2A2E',
              borderTopColor: '#D4AF37',
              borderRadius: '50%',
              margin: '0 auto 16px',
              animation: 'ckSpin 0.8s linear infinite',
            }}
          />
          <div style={{ color: '#8A8A8E', fontSize: '14px' }}>Carregando checkout...</div>
          <style>{`@keyframes ckSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  /* ── Error state ───────────────────────────────────────────────────────── */

  if (error || !data) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0A0A0C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'DM Sans', sans-serif",
          padding: '24px',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'center' }}>
            <KloelBrandLockup markSize={18} fontSize={15} fontWeight={600} />
          </div>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#128533;</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#E8E6E1', marginBottom: '8px' }}>
            Checkout nao encontrado
          </div>
          <div style={{ fontSize: '14px', color: '#8A8A8E', lineHeight: '1.5' }}>
            {error || 'O link que voce acessou pode estar incorreto ou expirado.'}
          </div>
        </div>
      </div>
    );
  }

  /* ── Resolve props ─────────────────────────────────────────────────────── */

  const config = data.checkoutConfig;
  const product = data.product;
  const plan = {
    id: data.id,
    name: data.name,
    priceInCents: data.priceInCents,
    compareAtPrice: data.compareAtPrice,
    currency: data.currency,
    maxInstallments: data.maxInstallments,
    installmentsFee: data.installmentsFee,
    quantity: data.quantity,
    freeShipping: data.freeShipping,
    shippingPrice: data.shippingPrice,
    orderBumps: data.orderBumps,
  };

  /* ── Pixels ───────────────────────────────────────────────────────────── */

  const pixels = config?.pixels || [];

  /* ── Theme selection ───────────────────────────────────────────────────── */

  const theme = config?.theme || 'BLANC';

  const themeEl =
    theme === 'NOIR' ? (
      <CheckoutNoir
        product={product}
        config={config}
        plan={plan}
        slug={data.slug}
        workspaceId={data.product?.workspaceId}
        checkoutCode={data.checkoutCode}
        paymentProvider={data.paymentProvider}
        affiliateContext={data.affiliateContext}
      />
    ) : (
      <CheckoutBlanc
        product={product}
        config={config}
        plan={plan}
        slug={data.slug}
        workspaceId={data.product?.workspaceId}
        checkoutCode={data.checkoutCode}
        paymentProvider={data.paymentProvider}
        affiliateContext={data.affiliateContext}
      />
    );

  return (
    <>
      {pixels.length > 0 && <PixelTracker pixels={pixels} event="PageView" />}
      {themeEl}
    </>
  );
}
