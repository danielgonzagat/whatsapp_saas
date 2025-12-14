"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, RefreshCw, Send, Sparkles, XCircle } from "lucide-react";
import { useAuth } from "@/components/kloel/auth/auth-provider";
import {
  createCampaign,
  createCampaignVariants,
  evaluateCampaignDarwin,
  launchCampaign,
  listCampaigns,
  type Campaign,
} from "@/lib/api";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status?: string | null) {
  if (!status) return "—";
  const key = String(status).toUpperCase();
  const map: Record<string, string> = {
    DRAFT: "Rascunho",
    SCHEDULED: "Agendada",
    RUNNING: "Em execução",
    PAUSED: "Pausada",
    COMPLETED: "Concluída",
    CANCELLED: "Cancelada",
  };
  return map[key] || status;
}

export default function CampaignsPage() {
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [variants, setVariants] = useState<number>(3);

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selected = useMemo(
    () => campaigns.find((c) => c.id === selectedId) || null,
    [campaigns, selectedId],
  );

  const stats = useMemo(() => {
    const total = campaigns.length;
    const running = campaigns.filter((c) => String(c.status).toUpperCase() === "RUNNING").length;
    const scheduled = campaigns.filter((c) => String(c.status).toUpperCase() === "SCHEDULED").length;
    const draft = campaigns.filter((c) => String(c.status).toUpperCase() === "DRAFT").length;
    return { total, running, scheduled, draft };
  }, [campaigns]);

  const refresh = async (opts?: { keepSelection?: boolean }) => {
    if (!workspaceId) return;
    setError(null);
    setLoadingCampaigns(true);
    try {
      const data = await listCampaigns(workspaceId);
      const normalized = Array.isArray(data) ? data : [];
      setCampaigns(normalized);
      if (!opts?.keepSelection && !selectedId && normalized[0]?.id) {
        setSelectedId(normalized[0].id);
      }
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar campanhas");
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      refresh();
    }
  }, [isLoading, isAuthenticated, workspaceId]);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(value);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      // ignore
    }
  };

  const handleCreate = async () => {
    if (!workspaceId) return;
    if (!name.trim()) return setError("Nome da campanha é obrigatório");
    if (!messageTemplate.trim()) return setError("Mensagem da campanha é obrigatória");

    setError(null);
    setCreating(true);
    try {
      const created = await createCampaign(workspaceId, {
        name: name.trim(),
        description: description.trim() || undefined,
        type: "MASS",
        messageTemplate: messageTemplate.trim(),
      });
      await refresh();
      setSelectedId(created.id);
      setName("");
      setDescription("");
      setMessageTemplate("");
    } catch (e: any) {
      setError(e?.message || "Falha ao criar campanha");
    } finally {
      setCreating(false);
    }
  };

  const runAction = async (key: string, fn: () => Promise<void>) => {
    if (!workspaceId || !selected) return;
    setError(null);
    setActionBusy(key);
    try {
      await fn();
      await refresh({ keepSelection: true });
    } catch (e: any) {
      setError(e?.message || "Falha ao executar ação");
    } finally {
      setActionBusy(null);
    }
  };

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
          <h1 className="text-xl font-semibold text-gray-900">Campanhas</h1>
          <p className="mt-2 text-sm text-gray-600">Faça login para gerenciar suas campanhas.</p>
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
          <h1 className="text-xl font-semibold text-gray-900">Campanhas</h1>
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Campanhas</h1>
          <p className="mt-1 text-sm text-gray-600">Crie e dispare campanhas em escala com SmartTime e Darwin.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Voltar ao chat
          </Link>
          <button
            onClick={() => refresh({ keepSelection: true })}
            disabled={loadingCampaigns}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={loadingCampaigns ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Atualizar
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Total</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Em execução</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{stats.running}</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Agendadas</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{stats.scheduled}</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Rascunhos</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{stats.draft}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Lista</div>
                <div className="text-xs text-gray-500">{campaigns.length} campanha(s)</div>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {loadingCampaigns ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-600">Nenhuma campanha criada ainda.</div>
              ) : (
                campaigns.map((c) => {
                  const isSelected = c.id === selectedId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={"w-full px-5 py-4 text-left hover:bg-gray-50 " + (isSelected ? "bg-gray-50" : "bg-white")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-900">{c.name || "Campanha"}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {statusLabel(c.status)} • {formatDateTime(c.createdAt)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(c.id);
                          }}
                          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
                          title="Copiar ID"
                        >
                          {copiedId === c.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gray-400" />
              <div className="text-sm font-semibold text-gray-900">Nova campanha</div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nome</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Black Friday"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Descrição (opcional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Oferta relâmpago para base quente"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Mensagem</label>
                <textarea
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  rows={4}
                  placeholder="Ex: Oi! Temos uma condição especial hoje..."
                  className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Criar campanha
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          {!selected ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white">
                <Sparkles className="h-5 w-5 text-gray-500" />
              </div>
              <div className="text-sm font-semibold text-gray-900">Selecione uma campanha</div>
              <div className="mt-2 text-sm text-gray-600">Escolha na lista para ver detalhes e executar ações.</div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{selected.name || "Campanha"}</h2>
                    <p className="mt-1 text-sm text-gray-600">{selected.description || "Sem descrição"}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900">
                    {statusLabel(selected.status)}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs font-medium text-gray-500">Criada</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{formatDateTime(selected.createdAt)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs font-medium text-gray-500">Agendada</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{formatDateTime(selected.scheduledAt)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 text-sm font-semibold text-gray-900">Ações</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    onClick={() =>
                      runAction("launch", () =>
                        launchCampaign(workspaceId, selected.id, { smartTime: false }).then(() => undefined),
                      )
                    }
                    disabled={actionBusy !== null}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      {actionBusy === "launch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Lançar agora
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      runAction("smarttime", () =>
                        launchCampaign(workspaceId, selected.id, { smartTime: true }).then(() => undefined),
                      )
                    }
                    disabled={actionBusy !== null}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      {actionBusy === "smarttime" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Lançar (SmartTime)
                    </span>
                  </button>
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={variants}
                      onChange={(e) => setVariants(Number(e.target.value))}
                      className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    />
                    <button
                      onClick={() =>
                        runAction("variants", () =>
                          createCampaignVariants(workspaceId, selected.id, variants).then(() => undefined),
                        )
                      }
                      disabled={actionBusy !== null}
                      className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        {actionBusy === "variants" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Darwin: variantes
                      </span>
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      runAction("evaluate", () =>
                        evaluateCampaignDarwin(workspaceId, selected.id).then(() => undefined),
                      )
                    }
                    disabled={actionBusy !== null}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      {actionBusy === "evaluate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Darwin: avaliar
                    </span>
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-gray-900">Mensagem</div>
                <div className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900">
                  {selected.messageTemplate || "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
