'use client';

import { Button } from '@/components/ui/button';
import { authApi, type AuthSessionEntry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Laptop, Monitor, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { CurrentSessionSummary } from './current-session-summary';
import type { SecuritySessionSurface } from './security-session-surface';

const iconByDeviceType = {
  mobile: Smartphone,
  desktop: Laptop,
  monitor: Monitor,
} as const;

function toSurface(session: AuthSessionEntry): SecuritySessionSurface {
  return {
    device: session.device,
    detail: session.detail,
    deviceType: session.deviceType,
  };
}

export function SecuritySessionsPanel({
  fallbackSurface,
  onSignOutCurrent,
  className,
}: {
  fallbackSurface: SecuritySessionSurface;
  onSignOutCurrent: () => Promise<void> | void;
  className?: string;
}) {
  const [sessions, setSessions] = useState<AuthSessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setLoading(true);
      setError(null);

      try {
        const response = await authApi.listSessions();
        if (cancelled) return;

        if (response.error) {
          throw new Error(response.error);
        }

        setSessions(Array.isArray(response.data?.sessions) ? response.data.sessions : []);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar sessões ativas.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentSession = useMemo(
    () => sessions.find((session) => session.isCurrent) || null,
    [sessions],
  );
  const otherSessions = useMemo(
    () => sessions.filter((session) => !session.isCurrent),
    [sessions],
  );

  const currentSurface = currentSession ? toSurface(currentSession) : fallbackSurface;

  const handleRevokeOthers = async () => {
    setRevokingOthers(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await authApi.revokeOtherSessions();
      if (response.error) {
        throw new Error(response.error);
      }

      setSessions((prev) => prev.filter((session) => session.isCurrent));
      setFeedback('As outras sessões foram encerradas com sucesso.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao encerrar as outras sessões.');
    } finally {
      setRevokingOthers(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    setError(null);
    setFeedback(null);

    try {
      const response = await authApi.revokeSession(sessionId);
      if (response.error) {
        throw new Error(response.error);
      }

      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      setFeedback('Sessão remota encerrada com sucesso.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao encerrar a sessão selecionada.');
    } finally {
      setRevokingSessionId(null);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <CurrentSessionSummary surface={currentSurface} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void onSignOutCurrent();
          }}
          className="w-full border-[rgba(224,82,82,0.35)] bg-transparent text-sm text-[#E05252] hover:bg-[rgba(224,82,82,0.08)] hover:text-[#E05252] sm:w-auto"
        >
          Sair deste dispositivo
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void handleRevokeOthers();
          }}
          disabled={otherSessions.length === 0 || revokingOthers || loading}
          className="w-full text-sm sm:w-auto"
        >
          {revokingOthers ? 'Encerrando outras sessões...' : 'Encerrar outras sessões'}
        </Button>
      </div>

      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : feedback ? (
        <p className="text-xs text-emerald-400">{feedback}</p>
      ) : null}

      <div className="rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-secondary)]/50 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--app-text-primary)]">
              Outras sessões ativas
            </p>
            <p className="text-xs text-[var(--app-text-secondary)]">
              Dispositivos com refresh token ainda válido nesta conta.
            </p>
          </div>
          {loading ? (
            <span className="text-xs text-[var(--app-text-secondary)]">Carregando...</span>
          ) : null}
        </div>

        {otherSessions.length === 0 ? (
          <p className="text-xs text-[var(--app-text-secondary)]">
            Nenhuma outra sessão ativa além deste dispositivo.
          </p>
        ) : (
          <div className="space-y-2">
            {otherSessions.map((session) => {
              const SessionIcon = iconByDeviceType[session.deviceType];

              return (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-card)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <SessionIcon
                      className="mt-0.5 h-4 w-4 text-[var(--app-text-secondary)]"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-[var(--app-text-primary)]">
                        {session.device}
                      </p>
                      <p className="text-xs text-[var(--app-text-secondary)]">{session.detail}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void handleRevokeSession(session.id);
                    }}
                    disabled={revokingSessionId === session.id}
                    className="text-sm"
                    aria-label={`Encerrar sessão ${session.device}`}
                  >
                    {revokingSessionId === session.id ? 'Encerrando...' : 'Encerrar sessão'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
