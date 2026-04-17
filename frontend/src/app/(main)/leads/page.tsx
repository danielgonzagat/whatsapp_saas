'use client';

export const dynamic = 'force-dynamic';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { type Lead, getLeads } from '@/lib/api';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { Check, Copy, Loader2, Search, Users, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const D_RE = /\D/g;

const STATUS_LABEL: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  new: 'Novo',
  cold: 'Frio',
  converted: 'Convertido',
};

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatTimeAgo(date: Date | null) {
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function leadTitle(lead: Lead) {
  return lead.name || lead.phone || 'Lead';
}

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

  const refreshLeads = async (opts?: { keepSelection?: boolean }) => {
    if (!workspaceId) return;
    setError(null);
    setLoadingLeads(true);
    try {
      const data = await getLeads(workspaceId, {
        status: status || undefined,
        search: searchTerm || undefined,
        limit: 200,
      });
      const normalized = (Array.isArray(data) ? data : []).map((l) => ({
        ...l,
        status: l.status || 'new',
      }));

      setLeads(normalized);

      if (opts?.keepSelection) return;
      if (!selectedLeadId && normalized[0]?.id) {
        setSelectedLeadId(normalized[0].id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar leads');
    } finally {
      setLoadingLeads(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      refreshLeads();
    }
  }, [isLoading, isAuthenticated, workspaceId]);

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    const handle = setTimeout(() => {
      refreshLeads({ keepSelection: true });
    }, 350);
    return () => clearTimeout(handle);
  }, [searchTerm, status]);

  useEffect(() => {
    if (!leads.length) return;
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
      if (!q) return matchesStatus;
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

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">Leads</h1>
          <p className="mt-2 text-sm text-[#6E6E73]">Faça login para visualizar seus leads.</p>
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
          <h1 className="text-xl font-semibold text-[#E0DDD8]">Leads</h1>
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
          <h1 className="text-2xl font-semibold text-[#E0DDD8]">Leads</h1>
          <p className="mt-1 text-sm text-[#6E6E73]">
            Acompanhe e acione contatos com intenção de compra.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/followups"
            className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
          >
            Follow-ups
          </Link>
          <Link href="/flow" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Flow
          </Link>
          <Link href="/inbox" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Inbox
          </Link>
          <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Voltar ao chat
          </Link>
          <button
            type="button"
            onClick={() => refreshLeads({ keepSelection: true })}
            disabled={loadingLeads}
            className="rounded-xl border border-[#222226] bg-[#111113] px-4 py-2 text-sm font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      {(sourceLabel || requestedLeadId || requestedPhone || requestedEmail) && (
        <div className="mb-6 rounded-2xl border border-[#222226] bg-[#111113] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6E6E73]">
                Contexto operacional
              </p>
              <p className="mt-1 text-sm text-[#E0DDD8]">
                {sourceLabel
                  ? `Voce chegou aqui via ${sourceLabel.toLowerCase()}.`
                  : 'Lead destacado para acao rapida.'}{' '}
                Use os atalhos abaixo para mover este contato para inbox, flow ou recuperacao.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/scrapers"
                className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Voltar para aquisicao
              </Link>
              <Link
                href="/followups"
                className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Abrir follow-ups
              </Link>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: list */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-[#222226] bg-[#111113] shadow-sm">
            <div className="border-b border-[#222226] px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#3A3A3F]" aria-hidden="true" />
                  <span className="text-sm font-semibold text-[#E0DDD8]">Lista</span>
                  <span className="text-xs text-[#6E6E73]">({filteredLeads.length})</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#3A3A3F]"
                    aria-hidden="true"
                  />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nome, telefone ou email"
                    className="w-full rounded-xl border border-[#222226] bg-[#19191C] py-2 pl-9 pr-3 text-sm text-[#E0DDD8] placeholder:text-[#3A3A3F] focus:outline-none focus:ring-2 focus:ring-[#E85D30]/20"
                  />
                </div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-sm text-[#E0DDD8] focus:outline-none focus:ring-2 focus:ring-[#E85D30]/20"
                >
                  <option value="">Todos os status</option>
                  <option value="hot">Quentes</option>
                  <option value="warm">Mornos</option>
                  <option value="new">Novos</option>
                  <option value="cold">Frios</option>
                  <option value="converted">Convertidos</option>
                </select>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {loadingLeads && leads.length === 0 ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[#6E6E73]" aria-hidden="true" />
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Nenhum lead encontrado</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">
                    {source === 'scrapers'
                      ? 'Volte para Scrapers e conclua uma importacao para abastecer esta fila.'
                      : 'Tente ajustar o filtro ou o termo de busca.'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Link
                      href="/scrapers"
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Abrir Scrapers
                    </Link>
                    <Link
                      href="/marketing/whatsapp?mode=broadcast"
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Preparar broadcast
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#222226]">
                  {filteredLeads.map((lead) => {
                    const isActive = lead.id === selectedLeadId;
                    const lastInteraction =
                      safeDate(lead.lastInteraction) ||
                      safeDate(lead.updatedAt) ||
                      safeDate(lead.createdAt);
                    const statusLabel = STATUS_LABEL[lead.status] || lead.status || '—';
                    return (
                      <button
                        type="button"
                        key={lead.id}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`w-full px-5 py-4 text-left transition-colors ${isActive ? 'bg-[#19191C]' : 'hover:bg-[#19191C]'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#E0DDD8]">
                              {leadTitle(lead)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-[#6E6E73]">{lead.phone}</p>
                            {lead.email ? (
                              <p className="mt-0.5 truncate text-xs text-[#6E6E73]">{lead.email}</p>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-[#19191C] px-2 py-0.5 text-[11px] font-semibold text-[#E0DDD8]">
                              {statusLabel}
                            </span>
                            <span className="text-[11px] text-[#6E6E73]">
                              {formatTimeAgo(lastInteraction)}
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

        {/* Right: details */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-[#222226] bg-[#111113] p-6 shadow-sm">
            {!selectedLead ? (
              <div>
                <h2 className="text-sm font-semibold text-[#E0DDD8]">Detalhes</h2>
                <p className="mt-2 text-sm text-[#6E6E73]">
                  Selecione um lead à esquerda para ver informações.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-[#E0DDD8]">
                      {leadTitle(selectedLead)}
                    </h2>
                    <p className="mt-1 text-sm text-[#6E6E73]">{selectedLead.phone}</p>
                    {selectedLead.email ? (
                      <p className="mt-1 text-sm text-[#6E6E73]">{selectedLead.email}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={buildLeadDashboardHref(selectedLead)}
                      className="rounded-xl border border-[#222226] bg-[#111113] px-3 py-2 text-sm font-semibold text-[#E0DDD8] hover:bg-[#19191C]"
                    >
                      Abrir com IA
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedLead.phone) return;
                        try {
                          await navigator.clipboard.writeText(selectedLead.phone);
                          setCopiedLeadId(selectedLead.id);
                          window.setTimeout(() => {
                            setCopiedLeadId((current) =>
                              current === selectedLead.id ? null : current,
                            );
                          }, 1200);
                        } catch {
                          // ignore
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#222226] bg-[#111113] px-3 py-2 text-sm font-semibold text-[#E0DDD8] hover:bg-[#19191C]"
                    >
                      {copiedLeadId === selectedLead.id ? (
                        <Check className="h-4 w-4 text-[#E0DDD8]" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4 text-[#6E6E73]" aria-hidden="true" />
                      )}
                      Copiar
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3">
                    <p className="text-xs font-medium text-[#6E6E73]">Status</p>
                    <p className="mt-1 text-sm font-semibold text-[#E0DDD8]">
                      {STATUS_LABEL[selectedLead.status] || selectedLead.status || '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3">
                    <p className="text-xs font-medium text-[#6E6E73]">Última intenção</p>
                    <p className="mt-1 text-sm font-semibold text-[#E0DDD8]">
                      {selectedLead.lastIntent || '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3">
                    <p className="text-xs font-medium text-[#6E6E73]">Mensagens</p>
                    <p className="mt-1 text-sm font-semibold text-[#E0DDD8]">
                      {selectedLead.totalMessages ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3">
                    <p className="text-xs font-medium text-[#6E6E73]">Última interação</p>
                    <p className="mt-1 text-sm font-semibold text-[#E0DDD8]">
                      {formatTimeAgo(
                        safeDate(selectedLead.lastInteraction) ||
                          safeDate(selectedLead.updatedAt) ||
                          safeDate(selectedLead.createdAt),
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-[#222226] bg-[#111113] px-4 py-3">
                  <p className="text-xs font-medium text-[#6E6E73]">Atalhos</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Link
                      href={`/inbox?source=leads&phone=${encodeURIComponent(selectedLead.phone || '')}`}
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3 text-sm font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Levar para Inbox
                      <span className="mt-1 block text-xs font-normal text-[#6E6E73]">
                        Assuma a conversa manualmente ou devolva para IA.
                      </span>
                    </Link>
                    <Link
                      href={buildLeadDashboardHref(selectedLead)}
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3 text-sm font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Pedir plano para IA
                      <span className="mt-1 block text-xs font-normal text-[#6E6E73]">
                        Abra o Kloel com o contexto deste lead e peça a próxima melhor ação.
                      </span>
                    </Link>
                    <Link
                      href={`/followups?source=leads&leadId=${encodeURIComponent(selectedLead.id)}`}
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3 text-sm font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Iniciar Follow-up
                      <span className="mt-1 block text-xs font-normal text-[#6E6E73]">
                        Recupere leads mornos e abandos sem perder contexto.
                      </span>
                    </Link>
                    <Link
                      href={`/flow?source=leads&leadId=${encodeURIComponent(selectedLead.id)}`}
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3 text-sm font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Automatizar no Flow
                      <span className="mt-1 block text-xs font-normal text-[#6E6E73]">
                        Transforme este lead em automacao de retorno ou nurture.
                      </span>
                    </Link>
                    <Link
                      href={`/marketing/whatsapp?mode=broadcast&source=leads&phone=${encodeURIComponent(selectedLead.phone || '')}`}
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-4 py-3 text-sm font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Acionar Marketing
                      <span className="mt-1 block text-xs font-normal text-[#6E6E73]">
                        Abra broadcast ou templates para destravar resposta rapida.
                      </span>
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link
                      href={buildDashboardHref({
                        source: 'leads',
                        purpose: 'qualification',
                        draft:
                          'Quero importar minha lista de leads e organizar a melhor operação de aquisição.',
                      })}
                      className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                    >
                      Pedir para o KLOEL importar
                    </Link>
                    <span className="text-[#3A3A3F]">•</span>
                    <Link
                      href="/autopilot"
                      className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                    >
                      Configurar Autopilot
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
