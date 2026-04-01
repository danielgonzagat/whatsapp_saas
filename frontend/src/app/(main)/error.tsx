'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      flex: 1, background: '#0A0A0C', padding: 40, minHeight: '60vh',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 8, background: '#111113',
        border: '1px solid #222226', display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.5}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 600, color: '#E0DDD8', marginBottom: 8 }}>
        Algo deu errado
      </h2>
      <p style={{
        fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#6E6E73',
        textAlign: 'center', maxWidth: 400, lineHeight: 1.6, marginBottom: 24,
      }}>
        Ocorreu um erro inesperado. Tente novamente ou volte para o inicio.
      </p>
      {error?.message && (
        <p style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#3A3A3F',
          background: '#111113', border: '1px solid #222226', borderRadius: 6,
          padding: '8px 16px', marginBottom: 24, maxWidth: 500, wordBreak: 'break-all',
        }}>
          {error.message}
        </p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={reset}
          style={{
            fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600,
            padding: '10px 24px', borderRadius: 6, border: 'none',
            background: '#E85D30', color: '#0A0A0C', cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
        <button
          onClick={() => router.replace('/dashboard')}
          style={{
            fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600,
            padding: '10px 24px', borderRadius: 6,
            border: '1px solid #222226', background: 'transparent',
            color: '#E0DDD8', cursor: 'pointer',
          }}
        >
          Voltar ao inicio
        </button>
      </div>
    </div>
  );
}
