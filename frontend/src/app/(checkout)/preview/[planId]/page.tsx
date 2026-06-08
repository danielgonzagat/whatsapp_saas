'use client';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import type React from 'react';
import { use, useEffect, useState } from 'react';
import CheckoutBlancSocial from '../../components/CheckoutBlancSocial';
import CheckoutNoirSocial from '../../components/CheckoutNoirSocial';

/** Checkout preview. */
export default function CheckoutPreview({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<Record<string, unknown>>(`/checkout/plans/${planId}/config`).then((response) => {
      if (!cancelled) {
        setConfig(response.error ? null : (response.data ?? null));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (!config) {
    return <div style={{ background: colors.background.void, minHeight: '100vh' }} />;
  }

  const Theme = config.theme === 'NOIR' ? CheckoutNoirSocial : CheckoutBlancSocial;
  const plan = config.plan as { product?: unknown } | undefined;
  const themeProps = {
    config,
    product: plan?.product,
    plan,
  } as React.ComponentProps<typeof Theme>;
  return <Theme {...themeProps} />;
}
