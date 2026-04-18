'use client';

import { useEffect, useMemo, useState } from 'react';
import { tokenStorage } from '@/lib/api/core';

type ImpersonationPayload = {
  access_token?: string;
  refresh_token?: string;
  workspace?: { id?: string; name?: string } | null;
  user?: { workspaceId?: string } | null;
  next?: string;
};

function readPayloadFromHash(): ImpersonationPayload | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const raw = params.get('session');
  if (!raw) return null;

  try {
    const decoded = window.atob(raw);
    return JSON.parse(decoded) as ImpersonationPayload;
  } catch {
    return null;
  }
}

export default function AuthImpersonatePage() {
  const [status, setStatus] = useState<'booting' | 'invalid' | 'done'>('booting');

  const fallbackNext = useMemo(() => '/dashboard', []);

  useEffect(() => {
    const payload = readPayloadFromHash();
    if (!payload?.access_token) {
      setStatus('invalid');
      return;
    }

    const workspaceId = payload.workspace?.id || payload.user?.workspaceId;
    tokenStorage.setToken(payload.access_token);
    if (payload.refresh_token) tokenStorage.setRefreshToken(payload.refresh_token);
    if (workspaceId) tokenStorage.setWorkspaceId(workspaceId);
    tokenStorage.ensureAuthCookie();

    const next = payload.next?.startsWith('/') ? payload.next : fallbackNext;
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
