'use client';

import {
  KloelBrandLockup,
  KloelLoadingState,
  KloelMushroomVisual,
} from '@/components/kloel/KloelBrand';
import { colors } from '@/lib/design-tokens';
import { buildAppUrl, sanitizeNextPath } from '@/lib/subdomains';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const sora = "var(--font-sora), 'Sora', sans-serif";

type MagicLinkState = 'loading' | 'success' | 'error';

function MagicLinkContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const linkToken = searchParams.get('link') || '';
  const nextPath = sanitizeNextPath(searchParams.get('next'), '/dashboard');

  const [state, setState] = useState<MagicLinkState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!token) {
      setState('error');
      setErrorMessage('Token de acesso inválido ou ausente.');
      return;
    }

    const consumeMagicLink = async () => {
      try {
        const res = await fetch('/api/auth/magic-link/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(linkToken ? { token, linkToken } : { token }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState('error');
          setErrorMessage(data.message || 'Link mágico inválido ou expirado.');
          return;
        }

        setState('success');
        window.setTimeout(() => {
          window.location.replace(buildAppUrl(nextPath, window.location.host));
        }, 1200);
      } catch {
        setState('error');
        setErrorMessage('Erro de conexão. Tente novamente.');
      }
    };

    void consumeMagicLink();
  }, [linkToken, nextPath, token]);

  const goToLogin = () => {
    window.location.replace('/login');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: sora,
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ marginBottom: 32 }}>
          <KloelBrandLockup markSize={22} fontSize={18} fontWeight={600} />
        </div>

        {state === 'loading' && (
          <>
            <div style={{ margin: '0 auto 24px', display: 'flex', justifyContent: 'center' }}>
              <KloelMushroomVisual size={52} traceColor="#FFFFFF" animated spores="animated" />
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: colors.text.silver,
                marginBottom: 8,
              }}
            >
              Validando link mágico
            </h1>
            <p
              style={{
                fontSize: 14,
                color: colors.text.muted,
                lineHeight: 1.5,
              }}
            >
              Aguarde enquanto autenticamos sua sessão...
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <KloelLoadingState
                label="Sessão autenticada"
                traceColor="#FFFFFF"
                hint="Você será redirecionado ao dashboard em instantes."
                minHeight="auto"
              />
            </div>
            <button
              type="button"
              onClick={() => window.location.replace(buildAppUrl(nextPath, window.location.host))}
              style={{
                height: 44,
                padding: '0 24px',
                background: colors.ember.primary,
                color: colors.text.inverted,
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: sora,
                cursor: 'pointer',
              }}
            >
              Ir para o app
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ margin: '0 auto 24px', display: 'flex', justifyContent: 'center' }}>
              <KloelMushroomVisual size={56} traceColor="#FFFFFF" spores="static" />
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: colors.text.silver,
                marginBottom: 8,
              }}
            >
              Link inválido
            </h1>
            <p
              style={{
                fontSize: 14,
                color: colors.text.muted,
                lineHeight: 1.5,
                marginBottom: 24,
              }}
            >
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={goToLogin}
              style={{
                height: 44,
                padding: '0 24px',
                background: colors.ember.primary,
                color: colors.text.inverted,
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: sora,
                cursor: 'pointer',
              }}
            >
              Voltar ao login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: colors.background.void,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: sora,
          }}
        >
          <KloelLoadingState label="Carregando" traceColor="#FFFFFF" />
        </div>
      }
    >
      <MagicLinkContent />
    </Suspense>
  );
}
