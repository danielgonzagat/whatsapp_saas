'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent, useEffect, useState } from 'react';
import { AuthScreenChrome } from '@/components/admin/auth-screen-chrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { adminAuthApi } from '@/lib/api/admin-auth-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { useAdminSession } from '@/lib/auth/admin-session-context';
import type { MfaSetupPayload } from '@/lib/auth/admin-session-types';

/** Mfa setup page. */
export default function MfaSetupPage() {
  return (
    <Suspense fallback={null}>
      <MfaSetupScreen />
    </Suspense>
  );
}

function MfaSetupScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const setupToken = params.get('token') ?? '';
  const { persistSession } = useAdminSession();

  const [payload, setPayload] = useState<MfaSetupPayload | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!setupToken) {
      setError('Token de configuração ausente. Faça login novamente.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    adminAuthApi
      .setupMfa(setupToken)
      .then((p) => {
        if (!cancelled) {
          setPayload(p);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        if (err instanceof AdminApiClientError) {
          setError(err.message);
        } else {
          setError('Erro inesperado ao gerar o segredo.');
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setupToken]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError('Digite o código de 6 dígitos.');
      return;
    }
    setBusy(true);
    try {
      const session = await adminAuthApi.verifyInitialMfa(setupToken, code);
      persistSession(session);
      router.replace('/');
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setError(err.message);
      } else {
        setError('Erro inesperado.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenChrome
      title="Configure o segundo fator"
      subtitle="Escaneie o QR com seu autenticador (Google Authenticator, Authy, 1Password)."
    >
      <div className="flex flex-col items-center gap-4">
        {loading ? (
          <Skeleton className="size-[240px]" />
        ) : payload ? (
          <img
            src={payload.qrDataUrl}
            alt="QR code do segundo fator"
            width={240}
            height={240}
            className="rounded-sm border border-border"
          />
        ) : null}
      </div>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="text-center text-lg tracking-[0.4em]"
          />
        </div>
        {error ? (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Validando…' : 'Ativar segundo fator'}
        </Button>
      </form>
    </AuthScreenChrome>
  );
}
