'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { KloelBrandLockup } from '@/components/kloel/KloelBrand';
import { API_BASE } from '@/lib/http';
import { normalizePublicCheckoutResponse } from '@/lib/public-checkout';
import type { PublicCheckoutResponse } from '@/lib/public-checkout-contract';
import { useEffect, useMemo, useState } from 'react';
import CheckoutBlancSocial from './CheckoutBlancSocial';
import CheckoutNoirSocial from './CheckoutNoirSocial';
import PixelTracker from './PixelTracker';

/* ─── Types ────────────────────────────────────────────────────────────────── */

type CheckoutData = PublicCheckoutResponse;

interface CheckoutShellProps {
  slug: string;
  mode?: 'slug' | 'code';
  initialData?: CheckoutData | null;
  initialError?: string | null;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function CheckoutShell({
  slug,
  mode = 'slug',
  initialData,
  initialError,
}: CheckoutShellProps) {
  const hasServerResult = initialData !== undefined || initialError !== undefined;
  const serverData = useMemo(
    () => (initialData ? normalizePublicCheckoutResponse(initialData) : null),
    [initialData],
  );
  const clientRequestKey = hasServerResult ? null : `${mode}:${slug}`;
  const [clientState, setClientState] = useState<{
    readonly requestKey: string | null;
    readonly data: CheckoutData | null;
    readonly error: string | null;
  }>(() => ({ requestKey: null, data: null, error: null }));

  useEffect(() => {
    if (!clientRequestKey) {
      return undefined;
    }

    const controller = new AbortController();
    const endpoint =
      mode === 'code'
        ? `${API_BASE}/checkout/public/r/${slug}`
        : `${API_BASE}/checkout/public/${slug}`;

    fetch(endpoint, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Checkout nao encontrado (${res.status})`);
        }
        return res.json();
      })
      .then((json: unknown) => {
        setClientState({
          requestKey: clientRequestKey,
          data: normalizePublicCheckoutResponse(json),
          error: null,
        });
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) {
          return;
        }
        setClientState({
          requestKey: clientRequestKey,
          data: null,
          error: err.message,
        });
      });

    return () => controller.abort();
  }, [slug, mode, clientRequestKey]);

  const clientResultCurrent = clientState.requestKey === clientRequestKey;
  const data = hasServerResult ? serverData : clientResultCurrent ? clientState.data : null;
  const error = hasServerResult
    ? (initialError ?? null)
    : clientResultCurrent
      ? clientState.error
      : null;
  const loading = hasServerResult ? false : !clientResultCurrent;

  /* ── Loading state ─────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: colors.background.void,
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
          background: colors.background.void,
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
