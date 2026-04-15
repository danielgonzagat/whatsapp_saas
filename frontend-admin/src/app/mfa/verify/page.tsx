'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent, useState } from 'react';
import { AuthScreenChrome } from '@/components/admin/auth-screen-chrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminAuthApi } from '@/lib/api/admin-auth-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { useAdminSession } from '@/lib/auth/admin-session-context';

export default function MfaVerifyPage() {
  return (
    <Suspense fallback={null}>
      <MfaVerifyScreen />
    </Suspense>
  );
}

function MfaVerifyScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const mfaToken = params.get('token') ?? '';
  const { persistSession } = useAdminSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError('Digite o código de 6 dígitos.');
      return;
    }
    setBusy(true);
    try {
      const session = await adminAuthApi.verifyMfa(mfaToken, code);
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
      title="Código do segundo fator"
      subtitle="Abra seu autenticador e informe o código atual."
    >
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
          {busy ? 'Validando…' : 'Entrar'}
        </Button>
      </form>
    </AuthScreenChrome>
  );
}
