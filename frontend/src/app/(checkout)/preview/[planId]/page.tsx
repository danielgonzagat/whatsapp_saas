'use client';
import { use, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/http';
import CheckoutNoir from '../../components/CheckoutNoir';
import CheckoutBlanc from '../../components/CheckoutBlanc';

export default function CheckoutPreview({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/checkout/plans/${planId}/config`)
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, [planId]);

  if (!config) return <div style={{ background: '#0A0A0C', minHeight: '100vh' }} />;

  const Theme = config.theme === 'NOIR' ? CheckoutNoir : CheckoutBlanc;
  return <Theme config={config} product={config.plan?.product} plan={config.plan} />;
}
