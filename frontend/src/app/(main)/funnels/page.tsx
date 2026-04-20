'use client';

/** Dynamic. */
export const dynamic = 'force-dynamic';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { type Conversation, listConversations, listFlowExecutions } from '@/lib/api';
import type { FlowExecutionSummary } from '@/lib/api/flows';
import { BarChart3, GitBranch, Loader2, RefreshCw, Search, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

function formatTime(value?: string) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type StatusFilter = 'ALL' | 'OPEN' | 'CLOSED' | 'PENDING' | 'SNOOZED';
type AssignedFilter = 'ALL' | 'UNASSIGNED' | 'ASSIGNED';

/** Funnels page. */
export default function FunnelsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilter>('ALL');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [executions, setExecutions] = useState<FlowExecutionSummary[]>([]);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [convs, execs] = await Promise.all([
        listConversations(workspaceId),
        listFlowExecutions(workspaceId, 25),
      ]);
      setConversations(Array.isArray(convs) ? convs : []);
      setExecutions(Array.isArray(execs) ? execs : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar funis');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      refresh();
    }
  }, [isLoading, isAuthenticated, workspaceId, refresh]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (conversations || [])
      .filter((c) => {
        if (statusFilter !== 'ALL' && (c.status || '').toUpperCase() !== statusFilter) {
          return false;
        }
        const hasAgent = Boolean(c.assignedAgent?.id);
        if (assignedFilter === 'UNASSIGNED' && hasAgent) {
          return false;
        }
        if (assignedFilter === 'ASSIGNED' && !hasAgent) {
          return false;
        }

        if (!q) {
          return true;
        }
        const name = (c.contact?.name || '').toLowerCase();
        const phone = (c.contact?.phone || '').toLowerCase();
        return name.includes(q) || phone.includes(q);
      })
      .slice(0, 200);
  }, [conversations, search, statusFilter, assignedFilter]);

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">Funis</h1>
          <p className="mt-2 text-sm text-[#6E6E73]">Faça login para operar Inbox + Flows.</p>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="rounded-xl bg-[#E85D30] px-4 py-2 text-sm font-semibold text-[#0A0A0C]"
            >
              Entrar
            </button>
            <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && isAuthenticated && !workspaceId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">Funis</h1>
          <p className="mt-2 text-sm text-[#6E6E73]">Workspace não configurado para esta sessão.</p>
          <div className="mt-6">
            <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[#3A3A3F]" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-[#E0DDD8]">Funis</h1>
          </div>
          <p className="mt-1 text-sm text-[#6E6E73]">
            Inbox com filtros + execuções de Flow no mesmo lugar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/analytics"
            className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
          >
            Analytics
          </Link>
          <Link href="/inbox" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Inbox
          </Link>
          <Link href="/flow" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Editor de Flow
          </Link>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#222226] bg-[#111113] px-4 py-2 text-sm font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-[#222226] bg-[#111113] shadow-sm">
            <div className="border-b border-[#222226] px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#E0DDD8]">Inbox</p>
                  <p className="mt-0.5 text-xs text-[#6E6E73]">
                    {filteredConversations.length} conversas (filtradas)
                  </p>
                </div>
                <div className="relative w-[240px] max-w-full">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#3A3A3F]"
                    aria-hidden="true"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome/telefone"
                    className="w-full rounded-xl border border-[#222226] bg-[#19191C] py-2 pl-9 pr-3 text-sm text-[#E0DDD8] placeholder:text-[#3A3A3F] outline-none focus:border-[#3A3A3F]"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-sm text-[#E0DDD8]"
                >
                  <option value="ALL">Status: Todos</option>
                  <option value="OPEN">Status: Open</option>
                  <option value="PENDING">Status: Pending</option>
                  <option value="SNOOZED">Status: Snoozed</option>
                  <option value="CLOSED">Status: Closed</option>
                </select>
                <select
                  value={assignedFilter}
                  onChange={(e) => setAssignedFilter(e.target.value as AssignedFilter)}
                  className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-sm text-[#E0DDD8]"
                >
                  <option value="ALL">Atribuição: Todas</option>
                  <option value="UNASSIGNED">Atribuição: Sem agente</option>
                  <option value="ASSIGNED">Atribuição: Com agente</option>
                </select>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {loading && conversations.length === 0 ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[#6E6E73]" aria-hidden="true" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Sem conversas</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">
                    Ajuste filtros/busca ou aguarde novas mensagens.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#222226]">
                  {filteredConversations.map((c) => {
                    const name = c.contact?.name || c.contact?.phone || 'Contato';
                    const phone = c.contact?.phone || '';
                    const agent = c.assignedAgent?.name || null;

                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() =>
                          router.push(`/inbox?conversationId=${encodeURIComponent(c.id)}`)
                        }
                        className="w-full px-5 py-4 text-left transition-colors hover:bg-[#19191C]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#E0DDD8]">{name}</p>
                            {phone ? (
                              <p className="mt-0.5 truncate text-xs text-[#6E6E73]">{phone}</p>
                            ) : null}
                            {agent ? (
                              <p className="mt-0.5 truncate text-xs text-[#6E6E73]">
                                Agente: {agent}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {c.unreadCount ? (
                              <span className="rounded-full bg-[#E85D30] px-2 py-0.5 text-[11px] font-semibold text-[#0A0A0C]">
                                {c.unreadCount}
                              </span>
                            ) : null}
                            <span className="text-[11px] text-[#6E6E73]">
                              {formatTime(c.lastMessageAt)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#6E6E73]">
                          <span className="rounded-full bg-[#19191C] px-2 py-0.5">
                            {c.status || ''}
                          </span>
                          {c.lastMessageStatus ? (
                            <span className="rounded-full bg-[#19191C] px-2 py-0.5">
                              {c.lastMessageStatus}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-[#222226] bg-[#111113] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#222226] px-5 py-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#3A3A3F]" aria-hidden="true" />
                <span className="text-sm font-semibold text-[#E0DDD8]">
                  Execuções de Flow (recentes)
                </span>
              </div>
              <span className="text-xs text-[#6E6E73]">{executions.length}</span>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {loading && executions.length === 0 ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[#6E6E73]" aria-hidden="true" />
                </div>
              ) : executions.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Sem execuções</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">
                    Assim que um flow rodar, ele aparece aqui.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#222226]">
                  {executions.map((exec) => {
                    const flowName = exec.flow?.name || 'Fluxo';
                    const status = exec.status || '';
                    const contact = exec.contact?.name || exec.contact?.phone || 'Contato';

                    return (
                      <button
                        type="button"
                        key={exec.id}
                        onClick={() => router.push('/flow')}
                        className="w-full px-5 py-4 text-left transition-colors hover:bg-[#19191C]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#E0DDD8]">
                              {flowName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[#6E6E73]">{contact}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-[#19191C] px-2 py-0.5 text-[11px] text-[#6E6E73]">
                              {status}
                            </span>
                            <span className="text-[11px] text-[#6E6E73]">
                              {formatTime(exec.createdAt)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
