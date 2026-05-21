'use client';
import { kloelT } from '@/lib/i18n/t';

export const dynamic = 'force-dynamic';
import { type Lead, getLeads } from '@/lib/api';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LeadsHeader } from './LeadsHeader';
import { LeadsContextBar } from './LeadsContextBar';
import { LeadsListPanel } from './LeadsListPanel';
import { LeadsDetailPanel } from './LeadsDetailPanel';
import { LEADS_DIGIT_RE as D_RE, leadTitle } from './leads-page.helpers';

export default function LeadsPage() {
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [loadingLeads, setLoadingLeads] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<string>('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [copiedLeadId, setCopiedLeadId] = useState<string | null>(null);

  const requestedLeadId = searchParams?.get('leadId') || null;
  const requestedPhone = searchParams?.get('phone') || null;
  const requestedEmail = searchParams?.get('email') || null;
  const source = searchParams?.get('source') || '';

  const sourceLabel = useMemo(() => {
    const labels: Record<string, string> = {
      scrapers: 'Importacao e prospeccao',
      inbox: 'Inbox operacional',
      followups: 'Follow-ups',
      marketing: 'Marketing',
      flow: 'Flow',
    };
    return labels[source] || '';
  }, [source]);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) || null,
    [leads, selectedLeadId],
  );

  const refreshLeads = useCallback(
    async (opts?: { keepSelection?: boolean }) => {
      if (!workspaceId) {
        return;
      }
      setError(null);
      setLoadingLeads(true);
      try {
        const lStatus = status || undefined;
        const lSearch = searchTerm || undefined;
        const data = await getLeads(workspaceId, {
          ...(lStatus !== undefined ? { status: lStatus } : {}),
          ...(lSearch !== undefined ? { search: lSearch } : {}),
          limit: 200,
        });
        const normalized = (Array.isArray(data) ? data : []).map((l) => ({
          ...l,
          status: l.status || 'new',
        }));

        setLeads(normalized);

        if (opts?.keepSelection) {
          return;
        }
        if (!selectedLeadId && normalized[0]?.id) {
          setSelectedLeadId(normalized[0].id);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Falha ao carregar leads');
      } finally {
        setLoadingLeads(false);
      }
    },
    [searchTerm, selectedLeadId, status, workspaceId],
  );

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      void refreshLeads();
    }
  }, [isAuthenticated, isLoading, refreshLeads, workspaceId]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) {
      return;
    }
    const handle = setTimeout(() => {
      void refreshLeads({ keepSelection: true });
    }, 350);
    return () => clearTimeout(handle);
  }, [isAuthenticated, refreshLeads, searchTerm, status, workspaceId]);

  useEffect(() => {
    if (!leads.length) {
      return;
    }
    const normalize = (value?: string | null) => (value || '').replace(D_RE, '');
    const matchedLead =
      (requestedLeadId ? leads.find((lead) => lead.id === requestedLeadId) : null) ||
      (requestedPhone
        ? leads.find((lead) => normalize(lead.phone).includes(normalize(requestedPhone)))
        : null) ||
      (requestedEmail
        ? leads.find((lead) => (lead.email || '').toLowerCase() === requestedEmail.toLowerCase())
        : null);

    if (matchedLead?.id && matchedLead.id !== selectedLeadId) {
      setSelectedLeadId(matchedLead.id);
    }
  }, [leads, requestedEmail, requestedLeadId, requestedPhone, selectedLeadId]);

  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return leads.filter((l) => {
      const matchesStatus = !status || l.status === status;
      if (!q) {
        return matchesStatus;
      }
      const hay = `${l.name || ''} ${l.phone || ''} ${l.email || ''}`.toLowerCase();
      return matchesStatus && hay.includes(q);
    });
  }, [leads, searchTerm, status]);

  const buildLeadDashboardHref = (lead: Lead, draft?: string) =>
    buildDashboardHref({
      source: 'leads',
      leadId: lead.id,
      phone: lead.phone || '',
      email: lead.email || '',
      name: lead.name || '',
      purpose: 'qualification',
      draft:
        draft ||
        `Analise este lead (${leadTitle(lead)}) e me diga a próxima melhor ação para avançar a venda.`,
    });

  const handleCopyPhone = async (lead: Lead) => {
    if (!lead.phone) {
      return;
    }
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopiedLeadId(lead.id);
      window.setTimeout(() => {
        setCopiedLeadId((current) => (current === lead.id ? null : current));
      }, 1200);
    } catch {
      // ignore
    }
  };

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">{kloelT(`Leads`)}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {kloelT(`Faça login para visualizar seus leads.`)}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {kloelT(`Entrar`)}
            </button>
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {kloelT(`Voltar ao chat`)}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && isAuthenticated && !workspaceId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">{kloelT(`Leads`)}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {kloelT(`Workspace não configurado para esta sessão.`)}
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {kloelT(`Voltar ao chat`)}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <LeadsHeader
        loadingLeads={loadingLeads}
        onRefresh={() => refreshLeads({ keepSelection: true })}
      />

      <LeadsContextBar
        sourceLabel={sourceLabel}
        requestedLeadId={requestedLeadId}
        requestedPhone={requestedPhone}
        requestedEmail={requestedEmail}
      />

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <LeadsListPanel
          loadingLeads={loadingLeads}
          leads={leads}
          filteredLeads={filteredLeads}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          status={status}
          onStatusChange={setStatus}
          selectedLeadId={selectedLeadId}
          onSelectLead={setSelectedLeadId}
          source={source}
        />
        <LeadsDetailPanel
          selectedLead={selectedLead}
          copiedLeadId={copiedLeadId}
          onCopyPhone={handleCopyPhone}
          buildLeadDashboardHref={buildLeadDashboardHref}
        />
      </div>
    </div>
  );
}
