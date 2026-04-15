'use client';
import { API_BASE } from '@/lib/http';
import { use, useEffect, useState } from 'react';
import CheckoutBlancSocial from '../../components/CheckoutBlancSocial';
import CheckoutNoirSocial from '../../components/CheckoutNoirSocial';

export default function CheckoutPreview({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/checkout/plans/${planId}/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, [planId]);

  if (!config) return <div style={{ background: '#0A0A0C', minHeight: '100vh' }} />;

  const Theme = config.theme === 'NOIR' ? CheckoutNoirSocial : CheckoutBlancSocial;
  return <Theme config={config} product={config.plan?.product} plan={config.plan} />;
}
