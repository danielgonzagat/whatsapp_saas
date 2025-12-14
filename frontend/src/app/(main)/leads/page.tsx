
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, Search, Users, XCircle } from "lucide-react";
import { useAuth } from "@/components/kloel/auth/auth-provider";
import { getLeads, type Lead } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  hot: "Quente",
  warm: "Morno",
  new: "Novo",
  cold: "Frio",
  converted: "Convertido",
};

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatTimeAgo(date: Date | null) {
  if (!date) return "—";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function leadTitle(lead: Lead) {
  return lead.name || lead.phone || "Lead";
}

export default function LeadsPage() {
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [loadingLeads, setLoadingLeads] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<string>("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [copiedLeadId, setCopiedLeadId] = useState<string | null>(null);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) || null,
    [leads, selectedLeadId]
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
        status: l.status || "new",
      }));

      setLeads(normalized);

      if (opts?.keepSelection) return;
      if (!selectedLeadId && normalized[0]?.id) {
        setSelectedLeadId(normalized[0].id);
      }
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar leads");
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

  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return leads.filter((l) => {
      const matchesStatus = !status || l.status === status;
      if (!q) return matchesStatus;
      const hay = `${l.name || ""} ${l.phone || ""} ${l.email || ""}`.toLowerCase();
      return matchesStatus && hay.includes(q);
    });
  }, [leads, searchTerm, status]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
          <p className="mt-2 text-sm text-gray-600">Faça login para visualizar seus leads.</p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => openAuthModal("login")}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Entrar
            </button>
            <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
          <p className="mt-2 text-sm text-gray-600">Workspace não configurado para esta sessão.</p>
          <div className="mt-6">
            <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
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
          <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
          <p className="mt-1 text-sm text-gray-600">Acompanhe e acione contatos com intenção de compra.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/inbox" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Inbox
          </Link>
          <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Voltar ao chat
          </Link>
          <button
            onClick={() => refreshLeads({ keepSelection: true })}
            disabled={loadingLeads}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: list */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-900">Lista</span>
                  <span className="text-xs text-gray-500">({filteredLeads.length})</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nome, telefone ou email"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                </div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
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
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-gray-900">Nenhum lead encontrado</p>
                  <p className="mt-1 text-xs text-gray-500">Tente ajustar o filtro ou o termo de busca.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredLeads.map((lead) => {
                    const isActive = lead.id === selectedLeadId;
                    const lastInteraction =
                      safeDate(lead.lastInteraction) || safeDate(lead.updatedAt) || safeDate(lead.createdAt);
                    const statusLabel = STATUS_LABEL[lead.status] || lead.status || "—";
                    return (
                      <button
                        key={lead.id}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`w-full px-5 py-4 text-left transition-colors ${isActive ? "bg-gray-50" : "hover:bg-gray-50"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{leadTitle(lead)}</p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">{lead.phone}</p>
                            {lead.email ? <p className="mt-0.5 truncate text-xs text-gray-500">{lead.email}</p> : null}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                              {statusLabel}
                            </span>
                            <span className="text-[11px] text-gray-500">{formatTimeAgo(lastInteraction)}</span>
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
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            {!selectedLead ? (
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Detalhes</h2>
                <p className="mt-2 text-sm text-gray-600">Selecione um lead à esquerda para ver informações.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-gray-900">{leadTitle(selectedLead)}</h2>
                    <p className="mt-1 text-sm text-gray-600">{selectedLead.phone}</p>
                    {selectedLead.email ? <p className="mt-1 text-sm text-gray-600">{selectedLead.email}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/chat?q=${encodeURIComponent(selectedLead.phone || "")}`}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Abrir chat
                    </Link>
                    <button
                      onClick={async () => {
                        if (!selectedLead.phone) return;
                        try {
                          await navigator.clipboard.writeText(selectedLead.phone);
                          setCopiedLeadId(selectedLead.id);
                          window.setTimeout(() => {
                            setCopiedLeadId((current) => (current === selectedLead.id ? null : current));
                          }, 1200);
                        } catch {
                          // ignore
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      {copiedLeadId === selectedLead.id ? (
                        <Check className="h-4 w-4 text-gray-900" />
                      ) : (
                        <Copy className="h-4 w-4 text-gray-500" />
                      )}
                      Copiar
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500">Status</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {STATUS_LABEL[selectedLead.status] || selectedLead.status || "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500">Última intenção</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{selectedLead.lastIntent || "—"}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500">Mensagens</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{selectedLead.totalMessages ?? "—"}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500">Última interação</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {formatTimeAgo(
                        safeDate(selectedLead.lastInteraction) ||
                          safeDate(selectedLead.updatedAt) ||
                          safeDate(selectedLead.createdAt)
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-gray-100 bg-white px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Atalhos</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Link
                      href="/chat?q=importar%20minha%20lista%20de%20leads"
                      className="text-sm font-medium text-gray-600 hover:text-gray-900"
                    >
                      Pedir para o KLOEL importar
                    </Link>
                    <span className="text-gray-300">•</span>
                    <Link href="/autopilot" className="text-sm font-medium text-gray-600 hover:text-gray-900">
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
