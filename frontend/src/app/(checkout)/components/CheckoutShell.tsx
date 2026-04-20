'use client';

import { kloelT } from '@/lib/i18n/t';
import { KloelBrandLockup } from '@/components/kloel/KloelBrand';
import { API_BASE } from '@/lib/http';
import { normalizePublicCheckoutResponse } from '@/lib/public-checkout';
import type { PublicCheckoutResponse } from '@/lib/public-checkout-contract';
import { useEffect, useState } from 'react';
import CheckoutBlancSocial from './CheckoutBlancSocial';
import CheckoutNoirSocial from './CheckoutNoirSocial';
import PixelTracker from './PixelTracker';

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
        if (!res.ok) {
          throw new Error(`Checkout nao encontrado (${res.status})`);
        }
        return res.json();
      })
      .then((json: unknown) => {
        setData(normalizePublicCheckoutResponse(json));
        setLoading(false);
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
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
              border: '3px solid rgba(255, 255, 255, 0.12)',
              borderTopColor: 'rgba(232, 93, 48, 0.72)',
              borderRadius: 16,
              margin: '0 auto 16px',
              animation: 'ckSpin 0.8s linear infinite',
            }}
          />
          <div style={{ color: 'rgba(255, 255, 255, 0.56)', fontSize: '14px' }}>
            
            {kloelT(`Carregando checkout...`)}
          </div>
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
          <div
            style={{
              width: '52px',
              height: '52px',
              margin: '0 auto 16px',
              borderRadius: 16,
              border: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          />
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'rgb(224, 221, 216)',
              marginBottom: '8px',
            }}
          >
            
            {kloelT(`Checkout nao encontrado`)}
          </div>
          <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.56)', lineHeight: '1.5' }}>
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
      <CheckoutNoirSocial
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
      <CheckoutBlancSocial
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
      {pixels.length > 0 && <PixelTracker pixels={pixels} event={kloelT(`PageView`)} />}
      {themeEl}
    </>
  );
}
