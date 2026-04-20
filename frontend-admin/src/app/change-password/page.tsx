'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent, useState } from 'react';
import { AuthScreenChrome } from '@/components/admin/auth-screen-chrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminAuthApi } from '@/lib/api/admin-auth-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

/** Change password page. */
export default function ChangePasswordPage() {
  return (
    <Suspense fallback={null}>
      <ChangePasswordScreen />
    </Suspense>
  );
}

function ChangePasswordScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const changeToken = params.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    if (!PASSWORD_RULE.test(newPassword)) {
      setError(
        'A senha precisa de ao menos 12 caracteres, com minúscula, maiúscula, número e símbolo.',
      );
      return;
    }
    if (!changeToken) {
      setError('Token de alteração ausente. Faça login novamente.');
      return;
    }
    setBusy(true);
    try {
      const response = await adminAuthApi.changePassword(changeToken, newPassword);
      // Backend always transitions to mfa_setup_required or mfa_required after
      // password change. Redirect accordingly.
      const next = response.state === 'mfa_setup_required' ? '/mfa/setup' : '/mfa/verify';
      const search = new URLSearchParams({
        token: 'token' in response ? (response.token as string) : '',
      });
      router.replace(`${next}?${search.toString()}`);
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
    <AuthScreenChrome title="Troque sua senha" subtitle="Obrigatório no primeiro acesso.">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="newPassword">Nova senha</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
            placeholder="Mínimo 12 caracteres"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmation">Confirmar senha</Label>
          <Input
            id="confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.currentTarget.value)}
            placeholder="Repita a senha"
          />
        </div>
        {error ? (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar e continuar'}
        </Button>
      </form>
    </AuthScreenChrome>
  );
}
