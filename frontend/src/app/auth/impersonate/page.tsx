'use client';

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
    window.history.replaceState(null, '', '/auth/impersonate');
    setStatus('done');
    window.location.replace(next);
  }, [fallbackNext]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card px-6 py-8 text-center">
        <div className="text-sm font-semibold text-foreground">Impersonação Kloel</div>
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
