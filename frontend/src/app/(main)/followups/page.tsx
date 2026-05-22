'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
export const dynamic = 'force-dynamic';

import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { tokenStorage } from '@/lib/api';
import { apiUrl } from '@/lib/http';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { AlertCircle, Calendar, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { FollowupsHeader } from './FollowupsHeader';
import { FollowupsContextBar } from './FollowupsContextBar';
import { FollowupsStatsCards } from './FollowupsStatsCards';
import { FollowupsTable } from './FollowupsTable';
import type { Followup, FollowupsResponse } from './followups.types';

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
    const interval = setInterval(loadFollowups, 30000);
    return () => clearInterval(interval);
  }, [loadFollowups]);

  useEffect(() => {
    if (!requestedPhone || search) {
      return;
    }
    setSearch(requestedPhone);
  }, [requestedPhone, search]);

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
        followup.status === 'executed' ? 'Executado' : followup.status === 'cancelled' ? 'Cancelado' : 'Pendente',
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

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <FollowupsHeader isLoading={isLoading} onRefresh={loadFollowups} />

        <FollowupsContextBar
          sourceLabel={sourceLabel}
          requestedPhone={requestedPhone}
          requestedLeadId={requestedLeadId}
          buildRecoveryDashboardHref={buildRecoveryDashboardHref}
        />

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

        <FollowupsStatsCards total={total} followups={followups} />

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" aria-hidden="true" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {isLoading && followups.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <KloelMushroomMark
              size={36}
              title="Carregando follow-ups"
              traceColor={colors.ember.primary}
            />
          </div>
        )}

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
              onClick={handleClearFilters}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            >
              {kloelT(`Limpar filtros`)}
            </button>
          </div>
        )}

        {filteredFollowups.length > 0 && (
          <FollowupsTable
            filteredFollowups={filteredFollowups}
            totalCount={followups.length}
            search={search}
            statusFilter={statusFilter}
            buildRecoveryDashboardHref={buildRecoveryDashboardHref}
            onClearFilters={handleClearFilters}
          />
        )}
      </div>
    </div>
  );
}
