'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useSecurityMutations, useSecurityState } from '@/hooks/useKyc';
import { kloelSettingsClass } from './contract';

const A_Z_RE = /[A-Z]/;
const RX_0_9_RE = /[0-9]/;
const A_ZA_Z0_9_RE = /[^A-Za-z0-9]/;

export type PasswordStrength = 'weak' | 'medium' | 'strong';

export function evalPasswordStrength(password: string): PasswordStrength {
  if (
    password.length >= 12 &&
    A_Z_RE.test(password) &&
    RX_0_9_RE.test(password) &&
    A_ZA_Z0_9_RE.test(password)
  ) {
    return 'strong';
  }
  if (password.length >= 8) {
    return 'medium';
  }
  return 'weak';
}

export function passwordStrengthLabel(strength: PasswordStrength) {
  return strength === 'weak' ? 'Fraca' : strength === 'medium' ? 'Média' : 'Forte';
}

export function PasswordStrengthBar({ strength }: { strength: PasswordStrength }) {
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <div
          className={`h-1 flex-1 rounded-full ${strength === 'weak' ? 'bg-red-400' : strength === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}`}
        />
        <div
          className={`h-1 flex-1 rounded-full ${strength === 'medium' || strength === 'strong' ? (strength === 'medium' ? 'bg-yellow-400' : 'bg-green-400') : 'bg-[var(--app-border-primary)]'}`}
        />
        <div
          className={`h-1 flex-1 rounded-full ${strength === 'strong' ? 'bg-green-400' : 'bg-[var(--app-border-primary)]'}`}
        />
      </div>
      <p className="text-xs text-[var(--app-text-secondary)]">
        {kloelT(`Força:`)} {passwordStrengthLabel(strength)}
      </p>
    </div>
  );
}

export function SessionsList() {
  const { security, isLoading, mutate } = useSecurityState();
  const { revokeSession } = useSecurityMutations();
  const [busyId, setBusyId] = useState('');
  const sessions = security?.sessions ?? [];
  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      parsed,
    );
  };
  return (
    <div>
      <h5 className="mb-3 text-sm font-medium text-[var(--app-text-primary)]">
        {kloelT(`Sessões ativas`)}
      </h5>
      {isLoading ? (
        <p className="text-sm text-[var(--app-text-secondary)]">
          {kloelT(`Carregando sessões...`)}
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-[var(--app-text-secondary)]">
          {kloelT(`Nenhuma sessão ativa encontrada.`)}
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between rounded-md bg-[var(--app-bg-secondary)] p-3"
            >
              <div>
                <p className="text-sm font-medium text-[var(--app-text-primary)]">
                  {kloelT(`Sessão iniciada em`)} {formatDate(session.createdAt)}
                </p>
                <p className="text-xs text-[var(--app-text-secondary)]">
                  {kloelT(`Expira em`)} {formatDate(session.expiresAt)}
                </p>
              </div>
              <Button
                variant="outline"
                className={`text-xs ${kloelSettingsClass.dangerButton}`}
                disabled={busyId === session.id}
                onClick={async () => {
                  setBusyId(session.id);
                  try {
                    await revokeSession(session.id);
                    await mutate();
                  } finally {
                    setBusyId('');
                  }
                }}
              >
                {busyId === session.id ? kloelT(`Encerrando...`) : kloelT(`Encerrar`)}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FeedbackBannerProps {
  message?: string | null;
  error?: string | null;
}

export function FeedbackBanner({ message, error }: FeedbackBannerProps) {
  if (!message && !error) {
    return null;
  }
  const toneClass = error
    ? 'border-[var(--semantic-error-soft)]/25 bg-[var(--semantic-error-soft)]/10 text-[var(--semantic-error-text)]'
    : 'border-[var(--app-border-primary)] bg-[var(--app-bg-card)] text-[var(--app-text-primary)]';
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${toneClass}`}>
      {error || message}
    </div>
  );
}
