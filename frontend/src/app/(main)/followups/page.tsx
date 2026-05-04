'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatDate, formatPhone, getStatusLabel } from './followups.helpers';
import { colors } from '@/lib/design-tokens';

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

/** Followups page. */
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
    if (!workspaceId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const accessToken = tokenStorage.getToken();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
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
    } catch (err) {
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
    if (!requestedPhone || search) {
      return;
    }
    setSearch(requestedPhone);
  }, [requestedPhone, search]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'executed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" aria-hidden="true" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-500" aria-hidden="true" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-500" aria-hidden="true" />;
    }
  };

  const filteredFollowups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return followups.filter((followup) => {
      if (statusFilter !== 'all' && followup.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Calendar className="w-8 h-8 text-primary" aria-hidden="true" />

              {kloelT(`Follow-ups Programados`)}
            </h1>
            <p className="text-muted-foreground mt-1">
              {kloelT(`Acompanhe todos os follow-ups agendados pela IA`)}
            </p>
          </div>
          <button
            type="button"
            onClick={loadFollowups}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-[#D04E25] disabled:bg-primary/50 text-primary-foreground font-medium rounded-lg transition-colors"
          >
            {isLoading ? (
              <KloelMushroomMark
                size={18}
                title="Atualizando follow-ups"
                traceColor="colors.background.void"
              />
            ) : (
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            )}

            {kloelT(`Atualizar`)}
          </button>
        </div>

        {(sourceLabel || requestedPhone || requestedLeadId) && (
          <div className="bg-card border border-border rounded-xl p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {kloelT(`Contexto operacional`)}
                </p>
                <p className="text-sm text-foreground mt-1">
                  {sourceLabel
                    ? `Você chegou aqui via ${sourceLabel.toLowerCase()}.`
                    : 'Follow-up destacado para ação imediata.'}{' '}
                  {kloelT(`Use esta fila para retomar o lead e decida se o próximo passo é inbox, flow ou
                  análise.`)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      buildRecoveryDashboardHref({
                        phone: requestedPhone,
                        leadId: requestedLeadId,
                      }),
                    )
                  }
                  className="px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Pedir plano para IA`)}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/inbox${requestedPhone ? `?source=followups&phone=${encodeURIComponent(requestedPhone)}` : ''}`,
                    )
                  }
                  className="px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Abrir Inbox`)}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/flow?source=followups${requestedPhone ? `&phone=${encodeURIComponent(requestedPhone)}` : ''}&purpose=recovery&tab=editor`,
                    )
                  }
                  className="px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Automatizar no Flow`)}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/analytics?tab=abandonos')}
                  className="px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Ver abandono`)}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-3 mb-6">
          <div className="flex items-center gap-3 bg-card rounded-xl border border-border px-4 py-3">
            <Search className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kloelT(`Buscar por telefone, mensagem ou status...`)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | Followup['status'])}
            className="bg-card rounded-xl border border-border px-4 py-3 text-sm text-foreground outline-none"
          >
            <option value="all">{kloelT(`Todos os status`)}</option>
            <option value="pending">{kloelT(`Pendentes`)}</option>
            <option value="executed">{kloelT(`Executados`)}</option>
            <option value="cancelled">{kloelT(`Cancelados`)}</option>
          </select>
          <button
            type="button"
            onClick={() => router.push('/flow')}
            className="px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {kloelT(`Abrir Flow`)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/inbox')}
            className="px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {kloelT(`Abrir Inbox`)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/analytics?tab=abandonos')}
            className="px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {kloelT(`Ver abandonos`)}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-xl p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/15 rounded-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{kloelT(`Total`)}</p>
                <p className="text-2xl font-bold text-foreground">{total}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-500/15 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{kloelT(`Pendentes`)}</p>
                <p className="text-2xl font-bold text-foreground">
                  {followups.filter((f) => f.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/15 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{kloelT(`Executados`)}</p>
                <p className="text-2xl font-bold text-foreground">
                  {followups.filter((f) => f.status === 'executed').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" aria-hidden="true" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && followups.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <KloelMushroomMark
              size={36}
              title="Carregando follow-ups"
              traceColor="colors.ember.primary"
            />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && followups.length === 0 && !error && (
          <div className="text-center py-20">
            <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {kloelT(`Nenhum follow-up agendado`)}
            </h3>
            <p className="text-muted-foreground">
              {kloelT(`A IA agenda follow-ups automaticamente durante as conversas`)}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/leads')}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground"
              >
                {kloelT(`Revisar leads`)}
              </button>
              <button
                type="button"
                onClick={() => router.push('/marketing/whatsapp?mode=broadcast')}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground"
              >
                {kloelT(`Abrir broadcast`)}
              </button>
            </div>
          </div>
        )}

        {!isLoading && followups.length > 0 && filteredFollowups.length === 0 && !error && (
          <div className="text-center py-16 bg-card border border-border rounded-xl mb-6">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {kloelT(`Nenhum follow-up combina com os filtros`)}
            </h3>
            <p className="text-muted-foreground mb-4">
              {kloelT(`Ajuste o status ou limpe a busca para voltar a ver todos os follow-ups.`)}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            >
              {kloelT(`Limpar filtros`)}
            </button>
          </div>
        )}

        {/* Follow-ups Table */}
        {filteredFollowups.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {kloelT(`Exibindo`)}{' '}
                <span className="text-foreground font-medium">{filteredFollowups.length}</span> de{' '}
                <span className="text-foreground font-medium">{followups.length}</span> follow-ups
              </div>
              {(search || statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                  className="text-xs text-primary font-medium"
                >
                  {kloelT(`Limpar filtros`)}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                      {kloelT(`Status`)}
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                      {kloelT(`Telefone`)}
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                      {kloelT(`Mensagem`)}
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                      {kloelT(`Agendado para`)}
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                      {kloelT(`Criado em`)}
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                      {kloelT(`Ações`)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFollowups.map((followup) => (
                    <tr
                      key={followup.id}
                      className="border-b border-border/60 hover:bg-muted transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(followup.status)}
                          <span className="text-sm text-foreground">
                            {getStatusLabel(followup.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                          <span className="text-sm text-foreground font-mono">
                            {formatPhone(followup.phone)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 max-w-xs">
                          <MessageSquare
                            className="w-4 h-4 text-muted-foreground flex-shrink-0"
                            aria-hidden="true"
                          />
                          <span
                            className="text-sm text-foreground truncate"
                            title={followup.message}
                          >
                            {followup.message || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-foreground">
                          {formatDate(followup.scheduledFor)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(followup.createdAt)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                buildRecoveryDashboardHref({
                                  phone: followup.phone,
                                  leadId: followup.contactId,
                                  draft: followup.message || '',
                                }),
                              )
                            }
                            className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-semibold text-foreground hover:bg-accent"
                          >
                            IA
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/inbox?source=followups&phone=${encodeURIComponent(followup.phone)}&draft=${encodeURIComponent(followup.message || '')}`,
                              )
                            }
                            className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-semibold text-foreground hover:bg-accent"
                          >
                            {kloelT(`Inbox`)}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/flow?source=followups&phone=${encodeURIComponent(followup.phone)}&leadId=${encodeURIComponent(followup.contactId)}&purpose=recovery&tab=editor`,
                              )
                            }
                            className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-semibold text-foreground hover:bg-accent"
                          >
                            {kloelT(`Flow`)}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/leads?source=followups&phone=${encodeURIComponent(followup.phone)}&leadId=${encodeURIComponent(followup.contactId)}`,
                              )
                            }
                            className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-semibold text-foreground hover:bg-accent"
                          >
                            {kloelT(`Lead`)}
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
