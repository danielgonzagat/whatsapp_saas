"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BarChart3, Loader2, RefreshCw, XCircle } from "lucide-react"
import {
  getAnalyticsAdvanced,
  getAnalyticsDailyActivity,
  getAnalyticsDashboard,
  type AnalyticsAdvancedResponse,
  type AnalyticsDailyActivityItem,
  type AnalyticsDashboardStats,
} from "@/lib/api"
import { Button } from "@/components/ui/button"

function formatPct(value: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—"
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`
}

function formatMoneyBRL(value: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatShortDate(dateIso: string) {
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) return dateIso
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-gray-500">{props.hint}</p> : null}
    </div>
  )
}

export function AnalyticsSettingsSection() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<AnalyticsDashboardStats | null>(null)
  const [activity, setActivity] = useState<AnalyticsDailyActivityItem[]>([])
  const [advanced, setAdvanced] = useState<AnalyticsAdvancedResponse | null>(null)

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [dashboard, daily, advancedResponse] = await Promise.all([
        getAnalyticsDashboard(),
        getAnalyticsDailyActivity(),
        getAnalyticsAdvanced(),
      ])

      setStats(dashboard)
      setActivity(Array.isArray(daily) ? daily : [])
      setAdvanced(advancedResponse || null)
    } catch (loadError: any) {
      setError(loadError?.message || "Nao foi possivel carregar analytics.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  const activityTotals = useMemo(() => {
    return activity.reduce(
      (acc, item) => {
        acc.inbound += item.inbound || 0
        acc.outbound += item.outbound || 0
        return acc
      },
      { inbound: 0, outbound: 0 },
    )
  }, [activity])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Analytics</h3>
          <p className="mt-1 text-sm text-gray-500">
            Painel consolidado de mensagens, vendas, filas e performance no shell principal.
          </p>
        </div>
        <Button
          onClick={() => void loadAnalytics()}
          disabled={loading}
          variant="outline"
          className="rounded-xl border-gray-200 bg-white"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {loading && !stats ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      ) : !stats ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">Sem analytics ainda</p>
          <p className="mt-1 text-sm text-gray-600">
            Assim que mensagens, leads e vendas rodarem no workspace, os indicadores aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard title="Mensagens" value={String(stats.messages)} hint="Inbound + outbound" />
            <StatCard title="Contatos" value={String(stats.contacts)} hint="Base do workspace" />
            <StatCard title="Execuções de flow" value={String(stats.flows)} hint="Últimos 7 dias" />
            <StatCard title="Taxa de entrega" value={formatPct(stats.deliveryRate)} />
            <StatCard title="Taxa de leitura" value={formatPct(stats.readRate)} />
            <StatCard title="Taxa de erro" value={formatPct(stats.errorRate)} />
          </div>

          {advanced ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard title="Receita paga" value={formatMoneyBRL(advanced.sales.totals.paidAmount || 0)} />
              <StatCard title="Vendas pagas" value={String(advanced.sales.totals.paidCount || 0)} />
              <StatCard
                title="Conversão"
                value={formatPct((advanced.sales.totals.conversionRate || 0) * 100)}
                hint="Pagas / total"
              />
              <StatCard title="Novos contatos" value={String(advanced.leads.newContacts || 0)} />
              <StatCard title="Flows concluídos" value={String(advanced.funnels.totals.completed || 0)} />
              <StatCard
                title="Conclusão de flow"
                value={formatPct((advanced.funnels.totals.completionRate || 0) * 100)}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-gray-500" />
                <h4 className="font-semibold text-gray-900">Atividade diária</h4>
              </div>
              <div className="mt-4 space-y-2">
                {activity.length === 0 ? (
                  <p className="text-sm text-gray-500">Sem atividade diária consolidada ainda.</p>
                ) : (
                  activity.slice(-7).map((item) => (
                    <div key={item.date} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <span className="text-sm font-medium text-gray-800">{formatShortDate(item.date)}</span>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Entrada: {item.inbound}</span>
                        <span>Saída: {item.outbound}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Inbound 7d</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{activityTotals.inbound}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Outbound 7d</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{activityTotals.outbound}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h4 className="font-semibold text-gray-900">Sentimento e lead score</h4>
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
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Lead alto</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.leadScore.high}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Lead médio</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.leadScore.medium}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">Lead baixo</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{stats.leadScore.low}</p>
                </div>
              </div>
            </div>
          </div>

          {advanced ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h4 className="font-semibold text-gray-900">Inbox por status</h4>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {Object.entries(advanced.inbox.conversationsByStatus || {}).slice(0, 8).map(([key, value]) => (
                    <div key={key} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-xs font-medium text-gray-500">{key}</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h4 className="font-semibold text-gray-900">Top flows e filas</h4>
                <div className="mt-4 space-y-2">
                  {(advanced.funnels.topFlows || []).slice(0, 5).map((flow) => (
                    <div key={flow.flowId} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <span className="text-sm text-gray-800">{flow.name || flow.flowId}</span>
                      <span className="text-sm font-semibold text-gray-900">{flow.executions}</span>
                    </div>
                  ))}
                  {(advanced.queues.stats || []).slice(0, 4).map((queue) => (
                    <div key={queue.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <span className="text-sm text-gray-800">{queue.name}</span>
                      <span className="text-sm font-semibold text-gray-900">{queue.waitingCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
