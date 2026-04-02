'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { colors } from '@/lib/design-tokens';

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
        {/* Logo */}
        <span
          style={{
            display: 'block',
            fontSize: 16,
            fontWeight: 700,
            color: colors.text.silver,
            letterSpacing: '-0.02em',
            marginBottom: 32,
          }}
        >
          Kloel
        </span>

        {state === 'loading' && (
          <>
            {/* Spinner */}
            <div
              style={{
                width: 32,
                height: 32,
                border: `2px solid ${colors.background.border}`,
                borderTopColor: colors.ember.primary,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 24px',
              }}
            />
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
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
            {/* Error icon */}
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
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
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
          }}
        >
          <p style={{ color: colors.text.muted, fontSize: 14 }}>Carregando...</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
