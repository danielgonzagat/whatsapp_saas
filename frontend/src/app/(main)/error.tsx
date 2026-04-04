'use client';

import { useEffect } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KloelMushroomVisual, KloelWordmark } from '@/components/kloel/KloelBrand';

const sora = "var(--font-sora), 'Sora', sans-serif";
const jetbrains = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  useEffect(() => {
    const retryId = window.setTimeout(() => {
      reset();
    }, 0);

    const revealId = window.setTimeout(() => {
      setShowFallback(true);
    }, 1200);

    return () => {
      window.clearTimeout(retryId);
      window.clearTimeout(revealId);
    };
  }, [reset]);

  if (!showFallback) {
    return (
      <div
        aria-hidden="true"
        style={{
          minHeight: '60vh',
          background: '#0A0A0C',
          flex: 1,
        }}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        background:
          'radial-gradient(circle at top, rgba(232, 93, 48, 0.12), transparent 36%), #0A0A0C',
        padding: 40,
        minHeight: '60vh',
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <KloelMushroomVisual size={88} traceColor="#FFFFFF" spores="static" />
      </div>

      <div style={{ marginBottom: 10 }}>
        <KloelWordmark color="#E0DDD8" fontSize={18} fontWeight={600} />
      </div>

      <h2
        style={{
          fontFamily: sora,
          fontSize: 22,
          fontWeight: 600,
          color: '#E0DDD8',
          margin: 0,
        }}
      >
        Algo saiu do compasso
      </h2>
      <p
        style={{
          fontFamily: sora,
          fontSize: 14,
          color: '#6E6E73',
          textAlign: 'center',
          maxWidth: 420,
          lineHeight: 1.6,
          margin: '10px 0 24px',
        }}
      >
        A energia se dispersou nesta rota. Tente novamente ou volte para o dashboard.
      </p>
      {error?.message ? (
        <p
          style={{
            fontFamily: jetbrains,
            fontSize: 11,
            color: '#3A3A3F',
            background: '#111113',
            border: '1px solid #222226',
            borderRadius: 8,
            padding: '10px 16px',
            margin: '0 0 24px',
            maxWidth: 520,
            wordBreak: 'break-word',
          }}
        >
          {error.message}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={reset}
          style={{
            fontFamily: sora,
            fontSize: 13,
            fontWeight: 600,
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: '#E85D30',
            color: '#0A0A0C',
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
        <button
          onClick={() => router.replace('/')}
          style={{
            fontFamily: sora,
            fontSize: 13,
            fontWeight: 600,
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid #222226',
            background: 'transparent',
            color: '#E0DDD8',
            cursor: 'pointer',
          }}
        >
          Voltar ao inicio
        </button>
      </div>
    </div>
  );
}
