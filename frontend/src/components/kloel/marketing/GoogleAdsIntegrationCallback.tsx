'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';

const GOOGLE_ADS_COLOR = 'rgb(251 188 4)';

export function GoogleAdsIntegrationCallback() {
  const [status, setStatus] = useState('Finalizando conexao Google Ads...');
  const params = useMemo(
    () =>
      typeof window === 'undefined'
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search),
    [],
  );

  useEffect(() => {
    const code = params.get('code') || '';
    const state = params.get('state') || '';
    if (!code) {
      queueMicrotask(() => setStatus('Google Ads nao retornou codigo de autorizacao.'));
      return;
    }

    void apiFetch<{
      connected?: boolean;
      status?: string;
      providerMessage?: string | null;
    }>('/marketing/connect/google-ads/complete', {
      method: 'POST',
      body: {
        code,
        state,
        redirectUri: `${window.location.origin}/integrations/google-ads/callback`,
      },
    })
      .then((response) => {
        if (response.error) {
          setStatus(response.error);
          return;
        }
        if (response.data?.connected === true) {
          setStatus('Google Ads conectado com sucesso.');
          return;
        }
        setStatus(
          response.data?.providerMessage ||
            response.data?.status ||
            'Falha ao conectar Google Ads.',
        );
      })
      .catch(() => {
        setStatus('Falha ao finalizar conexao Google Ads.');
      });
  }, [params]);

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
        <h1>{kloelT('Google Ads')}</h1>
        <p>{status}</p>
        <Link href="/marketing/google-ads" style={{ color: GOOGLE_ADS_COLOR, fontWeight: 700 }}>
          {kloelT('Voltar para Google Ads Marketing')}
        </Link>
      </div>
    </main>
  );
}
