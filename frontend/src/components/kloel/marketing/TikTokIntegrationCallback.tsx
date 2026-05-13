'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';

const TIKTOK_BRAND_COLOR = 'rgb(254 44 85)';

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
    const state = params.get('state') || '';
    if (!code) {
      setStatus('TikTok não retornou código de autorização.');
      return;
    }

    const redirectUri = `${window.location.origin}${
      kind === 'advertiser' ? '/integrations/tiktok/callback' : '/integrations/tiktok/auth/callback'
    }`;

    void apiFetch<{
      connected?: boolean;
      status?: string;
      providerMessage?: string | null;
    }>('/marketing/connect/tiktok/complete', {
      method: 'POST',
      body: { code, auth_code: code, kind, redirectUri, state },
    })
      .then((response) => {
        if (response.error) {
          setStatus(response.error);
          return;
        }
        if (response.data?.connected === true) {
          setStatus('TikTok conectado com sucesso.');
          return;
        }
        setStatus('Nao foi possivel confirmar a conexao TikTok. Tente conectar novamente.');
      })
      .catch(() => {
        setStatus('Falha ao finalizar conexão TikTok.');
      });
  }, [kind, params]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: KLOEL_THEME.bgPrimary,
        color: KLOEL_THEME.textPrimary,
        fontFamily: "'Sora', sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1>{kloelT('TikTok')}</h1>
        <p>{status}</p>
        <Link href="/marketing/tiktok" style={{ color: TIKTOK_BRAND_COLOR, fontWeight: 700 }}>
          {kloelT('Voltar para TikTok Marketing')}
        </Link>
      </div>
    </main>
  );
}
