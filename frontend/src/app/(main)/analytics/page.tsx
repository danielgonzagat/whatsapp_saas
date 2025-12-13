"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useAuth } from "@/components/kloel/auth/auth-provider";
import {
  getAnalyticsDashboard,
  getAnalyticsDailyActivity,
  getAnalyticsAdvanced,
  type AnalyticsDashboardStats,
  type AnalyticsDailyActivityItem,
  type AnalyticsAdvancedResponse,
} from "@/lib/api";

function formatDate(dateIso: string) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatPct(value: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatMoneyBRL(value: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-gray-500">{props.hint}</p> : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AnalyticsDashboardStats | null>(null);
  const [activity, setActivity] = useState<AnalyticsDailyActivityItem[]>([]);
  const [advanced, setAdvanced] = useState<AnalyticsAdvancedResponse | null>(null);

  const refresh = async () => {
    setError(null);
    setLoadingData(true);
    try {
      const [dashboard, daily, adv] = await Promise.all([
        getAnalyticsDashboard(),
        getAnalyticsDailyActivity(),
        getAnalyticsAdvanced(),
      ]);
      setStats(dashboard);
      setActivity(Array.isArray(daily) ? daily : []);
      setAdvanced(adv || null);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar analytics");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, workspaceId]);

  const activityTotals = useMemo(() => {
    const inbound = activity.reduce((sum, item) => sum + (item.inbound || 0), 0);
    const outbound = activity.reduce((sum, item) => sum + (item.outbound || 0), 0);
    return { inbound, outbound };
  }, [activity]);

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
          <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
          <p className="mt-2 text-sm text-gray-600">Faça login para acompanhar o desempenho do seu workspace.</p>
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
          <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
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
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-gray-400" />
            <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">Indicadores reais do seu WhatsApp + IA.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/inbox" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Inbox
          </Link>
          <Link href="/leads" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Leads
          </Link>
          <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Voltar ao chat
          </Link>
          <button
            onClick={refresh}
            disabled={loadingData}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
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

      {loadingData && !stats ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      ) : !stats ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Sem dados ainda</p>
          <p className="mt-1 text-sm text-gray-600">
            Assim que mensagens, leads e flows rodarem, os indicadores aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Mensagens (hoje)" value={String(stats.messages)} hint="Inbound + outbound" />
            <StatCard title="Contatos" value={String(stats.contacts)} hint="Base do workspace" />
            <StatCard title="Execuções de Flow (7d)" value={String(stats.flows)} hint="Total nos últimos 7 dias" />
            <StatCard title="Taxa de Entrega" value={formatPct(stats.deliveryRate)} hint="Considera SENT como entregue" />
            <StatCard title="Taxa de Leitura" value={formatPct(stats.readRate)} />
            <StatCard title="Taxa de Erro" value={formatPct(stats.errorRate)} />
          </div>

          {advanced ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard title="Receita (paga)" value={formatMoneyBRL(advanced.sales.totals.paidAmount || 0)} hint="Período selecionado" />
              <StatCard title="Vendas (pagas)" value={String(advanced.sales.totals.paidCount || 0)} hint="Pagas no período" />
              <StatCard title="Conversão" value={formatPct((advanced.sales.totals.conversionRate || 0) * 100)} hint="Pagas / totais" />
              <StatCard title="Novos contatos" value={String(advanced.leads.newContacts || 0)} hint="Criados no período" />
              <StatCard title="Flows concluídos" value={String(advanced.funnels.totals.completed || 0)} hint="Execuções concluídas" />
              <StatCard title="Conclusão de Flow" value={formatPct((advanced.funnels.totals.completionRate || 0) * 100)} hint="Concluídos / total" />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Sentimento (NeuroCRM)</h2>
              <p className="mt-1 text-xs text-gray-500">Distribuição atual dos contatos</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Positivo</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.sentiment.positive}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Neutro</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.sentiment.neutral}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Negativo</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.sentiment.negative}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Lead Score</h2>
              <p className="mt-1 text-xs text-gray-500">Buckets calculados no backend</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Alto</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.leadScore.high}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Médio</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.leadScore.medium}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Baixo</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.leadScore.low}</p>
                </div>
              </div>
            </div>
          </div>

          {advanced ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Inbox (período)</h2>
                    <p className="mt-1 text-xs text-gray-500">Conversas por status</p>
                  </div>
                  <Link href="/funnels" className="text-xs font-medium text-gray-600 hover:text-gray-900">
                    Abrir funis
                  </Link>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {Object.entries(advanced.inbox.conversationsByStatus || {}).slice(0, 8).map(([key, value]) => (
                    <div key={key} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-xs font-medium text-gray-500">{key}</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{value as any}</p>
                    </div>
                  ))}
                </div>

                {advanced.inbox.waitingByQueue?.length ? (
                  <div className="mt-5">
                    <p className="text-xs font-medium text-gray-500">Fila (sem agente, OPEN)</p>
                    <div className="mt-2 overflow-hidden rounded-xl border border-gray-100">
                      <div className="grid grid-cols-2 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
                        <div>Fila</div>
                        <div className="text-right">Aguardando</div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {advanced.inbox.waitingByQueue.slice(0, 6).map((q) => (
                          <div key={q.id} className="grid grid-cols-2 px-4 py-2 text-sm">
                            <div className="text-gray-900">{q.name}</div>
                            <div className="text-right text-gray-700">{q.waitingCount}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">Top flows (período)</h2>
                <p className="mt-1 text-xs text-gray-500">Por volume de execuções</p>

                {advanced.funnels.topFlows?.length ? (
                  <div className="mt-4 overflow-hidden rounded-xl border border-gray-100">
                    <div className="grid grid-cols-2 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
                      <div>Flow</div>
                      <div className="text-right">Execuções</div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {advanced.funnels.topFlows.slice(0, 6).map((f) => (
                        <div key={f.flowId} className="grid grid-cols-2 px-4 py-2 text-sm">
                          <div className="truncate text-gray-900">{f.name}</div>
                          <div className="text-right text-gray-700">{f.executions}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">Sem dados de flows</p>
                    <p className="mt-1 text-xs text-gray-500">Quando seus flows rodarem, o ranking aparece aqui.</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Atividade (7 dias)</h2>
                <p className="mt-1 text-xs text-gray-500">Inbound vs outbound</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-gray-500">Totais</p>
                <p className="mt-1 text-xs text-gray-600">
                  {activityTotals.inbound} inbound • {activityTotals.outbound} outbound
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-100">
              <div className="grid grid-cols-3 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
                <div>Dia</div>
                <div className="text-right">Inbound</div>
                <div className="text-right">Outbound</div>
              </div>
              <div className="divide-y divide-gray-100">
                {(activity || []).map((row) => (
                  <div key={row.date} className="grid grid-cols-3 px-4 py-2 text-sm">
                    <div className="text-gray-900">{formatDate(row.date)}</div>
                    <div className="text-right text-gray-600">{row.inbound}</div>
                    <div className="text-right text-gray-600">{row.outbound}</div>
                  </div>
                ))}
                {(!activity || activity.length === 0) && (
                  <div className="px-4 py-6 text-center text-sm text-gray-600">Sem mensagens nos últimos dias.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
