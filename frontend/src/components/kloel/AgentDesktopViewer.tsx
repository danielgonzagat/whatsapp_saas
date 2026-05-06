'use client';

import { kloelT, kloelError } from '@/lib/i18n/t';
import { ensureAnonymousSession } from '@/lib/anonymous-session';
import {
  type WhatsAppConnectionStatus,
  authApi,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
  resolveWorkspaceFromAuthPayload,
  tokenStorage,
} from '@/lib/api';
import { CheckCircle2, ExternalLink, RefreshCcw, Smartphone, Unplug } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentCursorTarget } from './AgentCursor';

interface AgentDesktopTraceEntry {
  id: string;
  type: string;
  phase?: string;
  message: string;
  timestamp: Date;
}

interface AgentDesktopViewerProps {
  isVisible: boolean;
  latestThought: string;
  isThinking: boolean;
  traceEntries: AgentDesktopTraceEntry[];
  cursorTarget?: AgentCursorTarget | null;
  autoConnect?: boolean;
  onClose: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

function formatTimestamp(value?: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }

  return value.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Agent desktop viewer. */
export function AgentDesktopViewer({
  isVisible,
  latestThought,
  isThinking,
  traceEntries,
  cursorTarget,
  autoConnect = true,
  onClose,
  onConnectionChange,
}: AgentDesktopViewerProps) {
  void cursorTarget;
  const [workspaceId, setWorkspaceId] = useState('');
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const ensureWorkspaceId = useCallback(async () => {
    const cachedWorkspaceId = tokenStorage.getWorkspaceId() || '';
    if (cachedWorkspaceId) {
      setWorkspaceId(cachedWorkspaceId);
      return cachedWorkspaceId;
    }

    const token = tokenStorage.getToken();
    if (token) {
      const me = await authApi.getMe();
      const recoveredWorkspaceId = resolveWorkspaceFromAuthPayload(me.data)?.id || '';

      if (!recoveredWorkspaceId) {
        throw kloelError('Workspace nao carregado.');
      }

      tokenStorage.setWorkspaceId(recoveredWorkspaceId);
      setWorkspaceId(recoveredWorkspaceId);
      return recoveredWorkspaceId;
    }

    const anonymous = await ensureAnonymousSession();
    setWorkspaceId(anonymous.workspaceId);
    return anonymous.workspaceId;
  }, []);

  const refreshStatus = useCallback(
    async (targetWorkspaceId?: string) => {
      const resolvedWorkspaceId = targetWorkspaceId || workspaceId;
      if (!resolvedWorkspaceId) {
        return;
      }

      setWorking(true);
      try {
        const nextStatus = await getWhatsAppStatus(resolvedWorkspaceId);
        setStatus(nextStatus);
        setError(null);
        onConnectionChange?.(nextStatus.connected);
      } catch (nextError: unknown) {
        const msg = nextError instanceof Error ? nextError.message : undefined;
        setError(msg || 'Falha ao carregar o status da Meta Cloud.');
      } finally {
        setWorking(false);
      }
    },
    [onConnectionChange, workspaceId],
  );

  const connectMeta = useCallback(async () => {
    const resolvedWorkspaceId = await ensureWorkspaceId();
    setWorking(true);

    try {
      const result = await initiateWhatsAppConnection(resolvedWorkspaceId);
      const targetUrl = result?.authUrl || status?.authUrl || '';

      if (targetUrl) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      } else {
        setError('A URL oficial da Meta nao foi retornada pelo backend.');
      }

      await refreshStatus(resolvedWorkspaceId);
    } catch (nextError: unknown) {
      const message = nextError instanceof Error ? nextError.message : undefined;
      setError(message || 'Falha ao iniciar a conexao oficial com a Meta.');
    } finally {
      setWorking(false);
    }
  }, [ensureWorkspaceId, refreshStatus, status?.authUrl]);

  useEffect(() => {
    if (!isVisible || !autoConnect) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const resolvedWorkspaceId = await ensureWorkspaceId();
        if (!cancelled) {
          await refreshStatus(resolvedWorkspaceId);
        }
      } catch (nextError) {
        if (!cancelled) {
          const message =
            nextError instanceof Error ? nextError.message : 'Falha ao carregar a conexao da Meta.';
          setError(message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoConnect, ensureWorkspaceId, isVisible, refreshStatus]);

  const statusTone = status?.connected
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-100';

  const activityEntries = useMemo(() => traceEntries.slice(-4).reverse(), [traceEntries]);

  return (
    <div className="relative w-full overflow-hidden rounded-[28px] border border-white/10 bg-[colors.background.void] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[colors.text.dim]">
            {kloelT(`Meta Cloud`)}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[colors.text.silver]">
            {kloelT(`Painel oficial de conexao`)}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-[colors.text.muted] transition hover:border-white/20 hover:text-white"
        >
          {kloelT(`Fechar`)}
        </button>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusTone}`}
          >
            {status?.connected ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {status?.connected ? 'WhatsApp conectado' : 'Conexao oficial pendente'}
          </div>

          <p className="mt-4 text-sm leading-6 text-[colors.text.muted]">
            {kloelT(`O runtime de QR e browser foi removido. Esta area agora opera apenas com a API oficial
            da Meta para WhatsApp, Instagram e outros canais Meta.`)}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[colors.text.dim]">
                {kloelT(`Numero`)}
              </p>
              <p className="mt-2 text-sm text-[colors.text.silver]">
                {status?.phone || 'Nao conectado'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[colors.text.dim]">
                {kloelT(`Phone Number ID`)}
              </p>
              <p className="mt-2 break-all text-sm text-[colors.text.silver]">
                {status?.phoneNumberId || 'Nao resolvido'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[colors.text.dim]">WABA</p>
              <p className="mt-2 break-all text-sm text-[colors.text.silver]">
                {status?.whatsappBusinessId || 'Nao resolvido'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[colors.text.dim]">
                {kloelT(`Estado`)}
              </p>
              <p className="mt-2 text-sm text-[colors.text.silver]">
                {status?.status || 'Desconhecido'}
              </p>
            </div>
          </div>

          {status?.degradedReason && !status.connected ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {status.degradedReason}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void connectMeta()}
              disabled={working}
              className="inline-flex items-center gap-2 rounded-full bg-[colors.text.silver] px-4 py-2 text-sm font-medium text-[colors.background.void] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {status?.connected ? 'Reconectar Meta' : 'Conectar com Meta'}
            </button>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={working}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-[colors.text.muted] transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw
                className={`h-4 w-4 ${working ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />

              {kloelT(`Atualizar status`)}
            </button>
          </div>
        </section>

        <section className="flex min-h-[420px] flex-col rounded-[24px] border border-white/10 bg-[colors.background.elevated] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-[colors.text.silver]">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-[colors.text.silver]">
                {kloelT(`Atividade do agente`)}
              </p>
              <p className="text-xs text-[colors.text.dim]">
                {kloelT(`O agente continua operando sobre inbox, automacoes e webhooks Meta.`)}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[colors.text.dim]">
              {kloelT(`Pensamento atual`)}
            </p>
            <p className="mt-3 text-sm leading-6 text-[colors.text.silver]">
              {latestThought || (isThinking ? 'Processando...' : 'Aguardando evento do Kloel.')}
            </p>
          </div>

          <div className="mt-4 flex-1 space-y-3">
            {activityEntries.length ? (
              activityEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[colors.text.silver]">{entry.message}</p>
                    <span className="text-xs text-[colors.text.dim]">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  {entry.phase ? (
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[colors.text.dim]">
                      {entry.phase}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-[colors.text.dim]">
                {kloelT(`Nenhuma atividade recente do agente para exibir.`)}
              </div>
            )}
          </div>

          <div className="relative mt-4 h-28 overflow-hidden rounded-2xl border border-white/8 bg-black/30">
            <div className="absolute inset-0 bg-[colors.background.surface]" />
            <div className="relative flex h-full items-end justify-between px-4 py-3 text-xs text-[colors.text.muted]">
              <span>
                {kloelT(`Workspace`)} {workspaceId || 'nao resolvido'}
              </span>
              <span>{status?.connected ? 'Meta ativa' : 'Aguardando autorizacao'}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
