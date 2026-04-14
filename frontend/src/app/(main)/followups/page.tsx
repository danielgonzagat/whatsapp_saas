'use client';

export const dynamic = 'force-dynamic';

import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface Followup {
  id: string;
  key: string;
  phone: string;
  contactId: string;
  message: string;
  scheduledFor: string;
  delayMinutes: number;
  status: 'pending' | 'executed' | 'cancelled';
  createdAt: string;
  executedAt?: string;
}

interface FollowupsResponse {
  total: number;
  followups: Followup[];
}

export default function FollowupsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = useWorkspaceId();
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Followup['status']>('all');
  const [search, setSearch] = useState('');
  const source = searchParams.get('source') || '';
  const requestedPhone = searchParams.get('phone') || '';
  const requestedLeadId = searchParams.get('leadId') || '';

  const sourceLabel = useMemo(() => {
    const labels: Record<string, string> = {
      leads: 'Leads',
      marketing: 'Marketing',
      inbox: 'Inbox',
      scrapers: 'Scrapers',
      flow: 'Flow',
    };
    return labels[source] || '';
  }, [source]);

  const loadFollowups = useCallback(async () => {
    if (!workspaceId) return;

    setIsLoading(true);
    setError(null);

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const accessToken = tokenStorage.getToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch(apiUrl('/kloel/followups'), {
        headers,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: FollowupsResponse = await res.json();
      setFollowups(data.followups || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error('Erro ao carregar follow-ups:', err);
      setError('Não foi possível carregar os follow-ups. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadFollowups();
    // Atualizar a cada 30 segundos
    const interval = setInterval(loadFollowups, 30000);
    return () => clearInterval(interval);
  }, [loadFollowups]);

  useEffect(() => {
    if (!requestedPhone || search) return;
    setSearch(requestedPhone);
  }, [requestedPhone, search]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'executed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'executed':
        return 'Executado';
      case 'cancelled':
        return 'Cancelado';
      default:
        return 'Pendente';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '-';
    // Formata telefone brasileiro
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const filteredFollowups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return followups.filter((followup) => {
      if (statusFilter !== 'all' && followup.status !== statusFilter) return false;
      if (!query) return true;
      return [
        followup.phone,
        followup.message,
        followup.contactId,
        getStatusLabel(followup.status),
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query),
      );
    });
  }, [followups, search, statusFilter]);

  const buildRecoveryDashboardHref = (input: {
    phone?: string | null;
    leadId?: string | null;
    draft?: string | null;
  }) =>
    buildDashboardHref({
      source: 'followups',
      phone: input.phone || '',
      leadId: input.leadId || '',
      purpose: 'recovery',
      draft:
        input.draft ||
        'Monte a melhor retomada para este contato e sugira a próxima ação para recuperar a conversão.',
    });

  return (
    <div className="min-h-screen bg-[#0A0A0C] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#E0DDD8] flex items-center gap-3">
              <Calendar className="w-8 h-8 text-[#E85D30]" />
              Follow-ups Programados
            </h1>
            <p className="text-[#6E6E73] mt-1">Acompanhe todos os follow-ups agendados pela IA</p>
          </div>
          <button
            onClick={loadFollowups}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[#E85D30] hover:bg-[#D04E25] disabled:bg-[#E85D30]/50 text-[#0A0A0C] font-medium rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {(sourceLabel || requestedPhone || requestedLeadId) && (
          <div className="bg-[#111113] border border-[#222226] rounded-xl p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6E6E73]">
                  Contexto operacional
                </p>
                <p className="text-sm text-[#E0DDD8] mt-1">
                  {sourceLabel
                    ? `Você chegou aqui via ${sourceLabel.toLowerCase()}.`
                    : 'Follow-up destacado para ação imediata.'}{' '}
                  Use esta fila para retomar o lead e decida se o próximo passo é inbox, flow ou
                  análise.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    router.push(
                      buildRecoveryDashboardHref({
                        phone: requestedPhone,
                        leadId: requestedLeadId,
                      }),
                    )
                  }
                  className="px-3 py-2 bg-[#19191C] border border-[#222226] rounded-lg text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                >
                  Pedir plano para IA
                </button>
                <button
                  onClick={() =>
                    router.push(
                      `/inbox${requestedPhone ? `?source=followups&phone=${encodeURIComponent(requestedPhone)}` : ''}`,
                    )
                  }
                  className="px-3 py-2 bg-[#19191C] border border-[#222226] rounded-lg text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                >
                  Abrir Inbox
                </button>
                <button
                  onClick={() =>
                    router.push(
                      `/flow?source=followups${requestedPhone ? `&phone=${encodeURIComponent(requestedPhone)}` : ''}&purpose=recovery&tab=editor`,
                    )
                  }
                  className="px-3 py-2 bg-[#19191C] border border-[#222226] rounded-lg text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                >
                  Automatizar no Flow
                </button>
                <button
                  onClick={() => router.push('/analytics?tab=abandonos')}
                  className="px-3 py-2 bg-[#19191C] border border-[#222226] rounded-lg text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                >
                  Ver abandono
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-3 mb-6">
          <div className="flex items-center gap-3 bg-[#111113] rounded-xl border border-[#222226] px-4 py-3">
            <Search className="w-4 h-4 text-[#6E6E73]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por telefone, mensagem ou status..."
              className="flex-1 bg-transparent text-sm text-[#E0DDD8] placeholder:text-[#3A3A3F] outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | Followup['status'])}
            className="bg-[#111113] rounded-xl border border-[#222226] px-4 py-3 text-sm text-[#E0DDD8] outline-none"
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="executed">Executados</option>
            <option value="cancelled">Cancelados</option>
          </select>
          <button
            onClick={() => router.push('/flow')}
            className="px-4 py-3 bg-[#111113] border border-[#222226] rounded-xl text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8] transition-colors"
          >
            Abrir Flow
          </button>
          <button
            onClick={() => router.push('/inbox')}
            className="px-4 py-3 bg-[#111113] border border-[#222226] rounded-xl text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8] transition-colors"
          >
            Abrir Inbox
          </button>
          <button
            onClick={() => router.push('/analytics?tab=abandonos')}
            className="px-4 py-3 bg-[#111113] border border-[#222226] rounded-xl text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8] transition-colors"
          >
            Ver abandonos
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-[#111113] rounded-xl p-5 border border-[#222226]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#E85D30]/15 rounded-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-[#E85D30]" />
              </div>
              <div>
                <p className="text-[#6E6E73] text-sm">Total</p>
                <p className="text-2xl font-bold text-[#E0DDD8]">{total}</p>
              </div>
            </div>
          </div>
          <div className="bg-[#111113] rounded-xl p-5 border border-[#222226]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-500/15 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <p className="text-[#6E6E73] text-sm">Pendentes</p>
                <p className="text-2xl font-bold text-[#E0DDD8]">
                  {followups.filter((f) => f.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-[#111113] rounded-xl p-5 border border-[#222226]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/15 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-[#6E6E73] text-sm">Executados</p>
                <p className="text-2xl font-bold text-[#E0DDD8]">
                  {followups.filter((f) => f.status === 'executed').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && followups.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#E85D30] animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && followups.length === 0 && !error && (
          <div className="text-center py-20">
            <Calendar className="w-16 h-16 text-[#6E6E73] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-[#E0DDD8] mb-2">Nenhum follow-up agendado</h3>
            <p className="text-[#6E6E73]">
              A IA agenda follow-ups automaticamente durante as conversas
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => router.push('/leads')}
                className="px-4 py-2 bg-[#111113] border border-[#222226] rounded-lg text-sm font-medium text-[#E0DDD8]"
              >
                Revisar leads
              </button>
              <button
                onClick={() => router.push('/marketing/whatsapp?mode=broadcast')}
                className="px-4 py-2 bg-[#111113] border border-[#222226] rounded-lg text-sm font-medium text-[#E0DDD8]"
              >
                Abrir broadcast
              </button>
            </div>
          </div>
        )}

        {!isLoading && followups.length > 0 && filteredFollowups.length === 0 && !error && (
          <div className="text-center py-16 bg-[#111113] border border-[#222226] rounded-xl mb-6">
            <Search className="w-12 h-12 text-[#6E6E73] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#E0DDD8] mb-2">
              Nenhum follow-up combina com os filtros
            </h3>
            <p className="text-[#6E6E73] mb-4">
              Ajuste o status ou limpe a busca para voltar a ver todos os follow-ups.
            </p>
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="px-4 py-2 bg-[#E85D30] text-[#0A0A0C] rounded-lg text-sm font-medium"
            >
              Limpar filtros
            </button>
          </div>
        )}

        {/* Follow-ups Table */}
        {filteredFollowups.length > 0 && (
          <div className="bg-[#111113] rounded-xl border border-[#222226] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#222226] flex items-center justify-between gap-4">
              <div className="text-sm text-[#6E6E73]">
                Exibindo{' '}
                <span className="text-[#E0DDD8] font-medium">{filteredFollowups.length}</span> de{' '}
                <span className="text-[#E0DDD8] font-medium">{followups.length}</span> follow-ups
              </div>
              {(search || statusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                  className="text-xs text-[#E85D30] font-medium"
                >
                  Limpar filtros
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#222226]">
                    <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                      Status
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                      Telefone
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                      Mensagem
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                      Agendado para
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                      Criado em
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFollowups.map((followup) => (
                    <tr
                      key={followup.id}
                      className="border-b border-[#222226]/60 hover:bg-[#19191C] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(followup.status)}
                          <span className="text-sm text-[#E0DDD8]">
                            {getStatusLabel(followup.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-[#6E6E73]" />
                          <span className="text-sm text-[#E0DDD8] font-mono">
                            {formatPhone(followup.phone)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 max-w-xs">
                          <MessageSquare className="w-4 h-4 text-[#6E6E73] flex-shrink-0" />
                          <span
                            className="text-sm text-[#E0DDD8] truncate"
                            title={followup.message}
                          >
                            {followup.message || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-[#E0DDD8]">
                          {formatDate(followup.scheduledFor)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-[#6E6E73]">
                          {formatDate(followup.createdAt)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() =>
                              router.push(
                                buildRecoveryDashboardHref({
                                  phone: followup.phone,
                                  leadId: followup.contactId,
                                  draft: followup.message || '',
                                }),
                              )
                            }
                            className="px-3 py-1.5 bg-[#19191C] border border-[#222226] rounded-lg text-[11px] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                          >
                            IA
                          </button>
                          <button
                            onClick={() =>
                              router.push(
                                `/inbox?source=followups&phone=${encodeURIComponent(followup.phone)}&draft=${encodeURIComponent(followup.message || '')}`,
                              )
                            }
                            className="px-3 py-1.5 bg-[#19191C] border border-[#222226] rounded-lg text-[11px] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                          >
                            Inbox
                          </button>
                          <button
                            onClick={() =>
                              router.push(
                                `/flow?source=followups&phone=${encodeURIComponent(followup.phone)}&leadId=${encodeURIComponent(followup.contactId)}&purpose=recovery&tab=editor`,
                              )
                            }
                            className="px-3 py-1.5 bg-[#19191C] border border-[#222226] rounded-lg text-[11px] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                          >
                            Flow
                          </button>
                          <button
                            onClick={() =>
                              router.push(
                                `/leads?source=followups&phone=${encodeURIComponent(followup.phone)}&leadId=${encodeURIComponent(followup.contactId)}`,
                              )
                            }
                            className="px-3 py-1.5 bg-[#19191C] border border-[#222226] rounded-lg text-[11px] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                          >
                            Lead
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
