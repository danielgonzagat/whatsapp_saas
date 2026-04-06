'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0C',
          color: '#E0DDD8',
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            padding: 28,
            boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Algo saiu do fluxo.</div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: 'rgba(224,221,216,0.78)',
              marginBottom: 18,
            }}
          >
            Registramos o erro para diagnóstico. Tente recarregar a experiência para continuar.
          </div>
          <button
            onClick={() => reset()}
            style={{
              height: 44,
              padding: '0 18px',
              borderRadius: 999,
              border: 'none',
              background: '#E85D30',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
