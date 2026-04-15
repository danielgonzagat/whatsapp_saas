'use client';

import {
  KloelBrandLockup,
  KloelLoadingState,
  KloelMushroomVisual,
} from '@/components/kloel/KloelBrand';
import { colors } from '@/lib/design-tokens';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

const sora = "var(--font-sora), 'Sora', sans-serif";

type VerifyState = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [state, setState] = useState<VerifyState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!token) {
      setState('error');
      setErrorMessage('Token de verificacao invalido ou ausente.');
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setState('error');
          setErrorMessage(data.message || 'Erro ao verificar e-mail. O link pode ter expirado.');
          return;
        }

        setState('success');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } catch {
        setState('error');
        setErrorMessage('Erro de conexao. Tente novamente.');
      }
    };

    verify();
  }, [token, router]);

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
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
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
              Verificando e-mail
            </h1>
            <p
              style={{
                fontSize: 14,
                color: colors.text.muted,
                lineHeight: 1.5,
              }}
            >
              Aguarde enquanto confirmamos seu e-mail...
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            {/* Checkmark */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                background: colors.ember.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.ember.primary}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: colors.text.silver,
                marginBottom: 8,
              }}
            >
              E-mail verificado
            </h1>
            <p
              style={{
                fontSize: 14,
                color: colors.text.muted,
                lineHeight: 1.5,
                marginBottom: 24,
              }}
            >
              Seu e-mail foi confirmado com sucesso. Voce sera redirecionado para o login em
              instantes.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
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
              Ir para o login
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
              Verificacao falhou
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
              onClick={() => router.push('/login')}
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

export default function VerifyEmailPage() {
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
            padding: 24,
          }}
        >
          <KloelLoadingState
            size={88}
            traceColor="#FFFFFF"
            label="Kloel"
            hint="verificando o acesso"
            minHeight={280}
          />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
