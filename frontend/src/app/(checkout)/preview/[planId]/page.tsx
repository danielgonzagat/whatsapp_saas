'use client';
import { API_BASE } from '@/lib/http';
import type React from 'react';
import { use, useEffect, useState } from 'react';
import CheckoutBlancSocial from '../../components/CheckoutBlancSocial';
import CheckoutNoirSocial from '../../components/CheckoutNoirSocial';

/** Checkout preview. */
export default function CheckoutPreview({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/checkout/plans/${planId}/config`)
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => setConfig(data))
      .catch(() => {});
  }, [planId]);

  if (!config) {
    return <div style={{ background: '#0A0A0C', minHeight: '100vh' }} />;
  }

  const Theme = config.theme === 'NOIR' ? CheckoutNoirSocial : CheckoutBlancSocial;
  const plan = config.plan as { product?: unknown } | undefined;
  const themeProps = {
    config,
    product: plan?.product,
    plan,
  } as unknown as React.ComponentProps<typeof Theme>;
  return <Theme {...themeProps} />;
}
