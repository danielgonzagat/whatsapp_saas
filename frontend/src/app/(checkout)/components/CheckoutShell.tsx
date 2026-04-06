'use client';

import React, { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/http';
import CheckoutNoir from './CheckoutNoir';
import CheckoutBlanc from './CheckoutBlanc';
import PixelTracker from './PixelTracker';
import { KloelBrandLockup } from '@/components/kloel/KloelBrand';
import { preloadMercadoPagoDeviceSession, preloadMercadoPagoSdk } from '@/lib/mercado-pago';
import {
  normalizePublicCheckoutResponse,
  type PublicCheckoutResponse,
} from '@/lib/public-checkout';

/* ─── Types ────────────────────────────────────────────────────────────────── */

type CheckoutData = PublicCheckoutResponse;

interface CheckoutShellProps {
  slug: string;
  mode?: 'slug' | 'code';
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function CheckoutShell({ slug, mode = 'slug' }: CheckoutShellProps) {
  const [data, setData] = useState<CheckoutData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mercadoPagoPublicKey =
    data?.paymentProvider?.publicKey || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || '';

  useEffect(() => {
    const controller = new AbortController();
    const endpoint =
      mode === 'code'
        ? `${API_BASE}/checkout/public/r/${slug}`
        : `${API_BASE}/checkout/public/${slug}`;

    setLoading(true);
    setError(null);

    fetch(endpoint, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Checkout nao encontrado (${res.status})`);
        return res.json();
      })
      .then((json: unknown) => {
        setData(normalizePublicCheckoutResponse(json));
        setLoading(false);
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [slug, mode]);

  useEffect(() => {
    if (data?.paymentProvider?.provider !== 'mercado_pago') return;
    preloadMercadoPagoSdk(mercadoPagoPublicKey).catch(() => undefined);
    preloadMercadoPagoDeviceSession().catch(() => undefined);
  }, [data?.paymentProvider?.provider, mercadoPagoPublicKey]);

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

  const forceMercadoPagoIdentity = data.paymentProvider?.provider === 'mercado_pago';
  const config = data.checkoutConfig
    ? {
        ...data.checkoutConfig,
        requireCPF: forceMercadoPagoIdentity || data.checkoutConfig.requireCPF,
        requirePhone: forceMercadoPagoIdentity || data.checkoutConfig.requirePhone,
      }
    : data.checkoutConfig;
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
        merchant={data.merchant}
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
        merchant={data.merchant}
      />
    );

  return (
    <>
      {pixels.length > 0 && <PixelTracker pixels={pixels} event="PageView" />}
      {themeEl}
    </>
  );
}
