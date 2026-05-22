'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';
import { Laptop, Monitor, Smartphone } from 'lucide-react';
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

interface SessionEntry {
  device: string;
  location: string;
  time: string;
  icon: LucideIcon;
  current: boolean;
}

export const DEFAULT_SESSIONS: SessionEntry[] = [
  {
    device: 'Chrome em MacBook Pro',
    location: 'São Paulo, Brasil',
    time: 'Agora (sessão atual)',
    icon: Laptop,
    current: true,
  },
  {
    device: 'Safari em iPhone 15',
    location: 'São Paulo, Brasil',
    time: 'Há 2 dias',
    icon: Smartphone,
    current: false,
  },
  {
    device: 'Firefox em Windows',
    location: 'Rio de Janeiro, Brasil',
    time: 'Há 5 dias',
    icon: Monitor,
    current: false,
  },
];

export function SessionsList({ sessions }: { sessions?: SessionEntry[] }) {
  const list = sessions ?? DEFAULT_SESSIONS;
  return (
    <div>
      <h5 className="mb-3 text-sm font-medium text-[var(--app-text-primary)]">
        {kloelT(`Sessões ativas`)}
      </h5>
      <div className="space-y-2">
        {list.map((session) => {
          const Icon = session.icon;
          return (
            <div
              key={session.device}
              className={`flex items-center justify-between rounded-md p-3 ${session.current ? 'bg-[var(--app-accent-light)]' : 'bg-[var(--app-bg-secondary)]'}`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`h-5 w-5 ${session.current ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-secondary)]'}`}
                />
                <div>
                  <p className="text-sm font-medium text-[var(--app-text-primary)]">
                    {session.device}
                  </p>
                  <p className="text-xs text-[var(--app-text-secondary)]">
                    {session.location} · {session.time}
                  </p>
                </div>
              </div>
              {session.current && (
                <span className="rounded-full bg-[var(--app-accent-light)] px-2 py-0.5 text-xs font-medium text-[var(--app-accent)]">
                  {kloelT(`Atual`)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Button
        variant="outline"
        className={`mt-3 w-full text-sm ${kloelSettingsClass.dangerButton}`}
      >
        {kloelT(`Encerrar outras sessões`)}
      </Button>
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
