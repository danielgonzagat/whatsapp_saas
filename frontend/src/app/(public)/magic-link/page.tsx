'use client';

import { authApi } from '@/lib/api';
import { buildAppUrl, sanitizeNextPath } from '@/lib/subdomains';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const sora = "var(--font-sora), 'Sora', sans-serif";
const mono = "var(--font-jetbrains), 'JetBrains Mono', monospace";

export default function MagicLinkPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Validando seu link de acesso...');

  const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams]);
  const fallbackRedirect = useMemo(
    () => sanitizeNextPath(searchParams.get('redirectTo'), '/'),
    [searchParams],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Este link mágico está incompleto ou expirou.');
        return;
      }

      const result = await authApi.verifyMagicLink(token);
      if (cancelled) {
        return;
      }

      if (result.error) {
        setStatus('error');
        setMessage(result.error || 'Não foi possível validar o link mágico.');
        return;
      }

      setStatus('success');
      setMessage('Acesso confirmado. Redirecionando para sua conta...');

      const redirectTo = sanitizeNextPath(
        (result.data as { redirectTo?: string } | undefined)?.redirectTo,
        fallbackRedirect,
      );
      const destination = buildAppUrl(redirectTo, window.location.host);
      window.location.replace(destination);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [fallbackRedirect, token]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0A0A0C',
        color: '#E0DDD8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#111113',
          border: '1px solid #222226',
          borderRadius: 6,
          padding: '32px 28px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#E85D30',
            margin: '0 0 16px',
          }}
        >
          Magic Link
        </p>
        <h1
          style={{
            fontFamily: sora,
            fontSize: 32,
            lineHeight: 1.1,
            fontWeight: 500,
            margin: '0 0 12px',
          }}
        >
          {status === 'error' ? 'Link inválido' : 'Entrando na Kloel'}
        </h1>
        <p
          style={{
            fontFamily: sora,
            fontSize: 16,
            lineHeight: 1.7,
            color: status === 'error' ? '#E85D30' : '#6E6E73',
            margin: 0,
          }}
        >
          {message}
        </p>
      </section>
    </main>
  );
}
