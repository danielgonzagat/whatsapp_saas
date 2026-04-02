'use client';

import { useEffect } from 'react';
import { buildMarketingUrl } from '@/lib/subdomains';

export default function PublicError() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const id = window.setTimeout(() => {
      window.location.replace(buildMarketingUrl('/', window.location.host));
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        minHeight: '100vh',
        background: '#0A0A0C',
      }}
    />
  );
}
