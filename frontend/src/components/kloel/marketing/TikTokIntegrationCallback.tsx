'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export function TikTokIntegrationCallback({ kind }: { kind: 'creator' | 'advertiser' }) {
  const [status, setStatus] = useState('Finalizando conexão TikTok...');
  const params = useMemo(
    () =>
      typeof window === 'undefined'
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search),
    [],
  );

  useEffect(() => {
    const code = params.get('code') || params.get('auth_code') || '';
    if (!code) {
      setStatus('TikTok não retornou código de autorização.');
      return;
    }

    const redirectUri = `${window.location.origin}${
      kind === 'advertiser' ? '/integrations/tiktok/callback' : '/integrations/tiktok/auth/callback'
    }`;

    void apiFetch('/marketing/connect/tiktok/complete', {
      method: 'POST',
      body: { code, auth_code: code, kind, redirectUri },
    }).then((response) => {
      setStatus(response.error || 'TikTok conectado com sucesso.');
    });
  }, [kind, params]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0A0A0C',
        color: '#E0DDD8',
        fontFamily: "'Sora', sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1>TikTok</h1>
        <p>{status}</p>
        <Link href="/marketing/tiktok" style={{ color: '#FE2C55', fontWeight: 700 }}>
          Voltar para TikTok Marketing
        </Link>
      </div>
    </main>
  );
}
