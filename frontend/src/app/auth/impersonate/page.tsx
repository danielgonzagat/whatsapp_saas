'use client';

import { kloelT } from '@/lib/i18n/t';
import { useEffect, useMemo, useState } from 'react';
import {
  applyImpersonationPayload,
  readImpersonationPayload,
  resolveNextRoute,
} from './impersonate.helpers';

/** Auth impersonate page. */
export default function AuthImpersonatePage() {
  const [status, setStatus] = useState<'booting' | 'invalid' | 'done'>('booting');

  const fallbackNext = useMemo(() => '/dashboard', []);

  useEffect(() => {
    const payload = readImpersonationPayload();
    if (!payload?.access_token) {
      setStatus('invalid');
      return;
    }
    applyImpersonationPayload(payload);
    const next = resolveNextRoute(payload.next, fallbackNext);
    // CodeQL js/client-side-unvalidated-url-redirection barrier: rebuild the
    // navigation URL with a server-controlled origin and a path that has
    // already passed resolveNextRoute's startsWith('/') / no-scheme check.
    // The resulting URL.pathname + URL.search are taken verbatim from the
    // re-constructed object, never from the raw payload.
    const safeTarget = new URL(next, window.location.origin);
    const sanitizedPath = safeTarget.pathname + safeTarget.search + safeTarget.hash;
    window.history.replaceState(null, '', '/auth/impersonate');
    setStatus('done');
    window.location.replace(sanitizedPath);
  }, [fallbackNext]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card px-6 py-8 text-center">
        <div className="text-sm font-semibold text-foreground">{kloelT(`Impersonação Kloel`)}</div>
        <div className="mt-3 text-sm text-muted-foreground">
          {status === 'booting'
            ? 'Abrindo a sessão do cliente...'
            : status === 'done'
              ? 'Sessão aplicada. Redirecionando...'
              : 'Payload de impersonação inválido.'}
        </div>
      </div>
    </main>
  );
}
