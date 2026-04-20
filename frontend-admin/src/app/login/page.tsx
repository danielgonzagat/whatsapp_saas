'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AuthScreenChrome } from '@/components/admin/auth-screen-chrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminAuthApi } from '@/lib/api/admin-auth-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { useAdminSession } from '@/lib/auth/admin-session-context';
import type { LoginResponse } from '@/lib/auth/admin-session-types';

/** Login page. */
export default function LoginPage() {
  const router = useRouter();
  const { persistSession } = useAdminSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response: LoginResponse = await adminAuthApi.login(email, password);
      if (response.state === 'authenticated') {
        persistSession(response);
        router.replace('/');
        return;
      }
      const params = new URLSearchParams({ token: response.token });
      if (response.state === 'password_change_required') {
        router.replace(`/change-password?${params.toString()}`);
      } else if (response.state === 'mfa_setup_required') {
        router.replace(`/mfa/setup?${params.toString()}`);
      } else {
        router.replace(`/mfa/verify?${params.toString()}`);
      }
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setError(err.message);
      } else {
        setError('Erro inesperado. Tente novamente.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenChrome
      title="Entrar no painel"
      subtitle="Use sua conta administrativa."
      footer={<span>Acesso restrito a administradores autorizados.</span>}
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="voce@kloel.com"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder="••••••••••••"
          />
        </div>
        {error ? (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="mt-2">
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthScreenChrome>
  );
}
