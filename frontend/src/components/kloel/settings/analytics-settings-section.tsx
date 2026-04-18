'use client';

import { Button } from '@/components/ui/button';
import {
  type AnalyticsAdvancedResponse,
  type AnalyticsDailyActivityItem,
  type AnalyticsDashboardStats,
  getAnalyticsAdvanced,
  getAnalyticsDailyActivity,
  getAnalyticsDashboard,
} from '@/lib/api';
import { BarChart3, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SettingsCard,
  SettingsHeader,
  SettingsMetricTile,
  SettingsNotice,
  kloelSettingsClass,
} from './contract';

function formatPct(value: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatMoneyBRL(value: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatShortDate(dateIso: string) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <SettingsMetricTile>
      <p className="text-xs font-medium text-[var(--app-text-secondary)]">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--app-text-primary)]">{props.value}</p>
      {props.hint ? (
        <p className="mt-1 text-xs text-[var(--app-text-secondary)]">{props.hint}</p>
      ) : null}
    </SettingsMetricTile>
  );
}

export function AnalyticsSettingsSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AnalyticsDashboardStats | null>(null);
  const [activity, setActivity] = useState<AnalyticsDailyActivityItem[]>([]);
  const [advanced, setAdvanced] = useState<AnalyticsAdvancedResponse | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [dashboard, daily, advancedResponse] = await Promise.all([
        getAnalyticsDashboard(),
        getAnalyticsDailyActivity(),
        getAnalyticsAdvanced(),
      ]);

      setStats(dashboard);
      setActivity(Array.isArray(daily) ? daily : []);
      setAdvanced(advancedResponse || null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar analytics.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const activityTotals = useMemo(() => {
    return activity.reduce(
      (acc, item) => {
        acc.inbound += item.inbound || 0;
        acc.outbound += item.outbound || 0;
        return acc;
      },
      { inbound: 0, outbound: 0 },
    );
  }, [activity]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className={kloelSettingsClass.sectionTitle}>Analytics</h3>
          <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
            Painel consolidado de mensagens, vendas, filas e performance no shell principal.
          </p>
        </div>
        <Button
          onClick={() => void loadAnalytics()}
          disabled={loading}
          variant="outline"
          className={kloelSettingsClass.outlineButton}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Atualizar
        </Button>
      </div>

      {error && (
        <SettingsNotice tone="danger" className="flex items-center gap-3">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </SettingsNotice>
      )}

      {loading && !stats ? (
        <SettingsCard className="flex min-h-[220px] items-center justify-center">
          <Loader2
            className="h-6 w-6 animate-spin text-[var(--app-text-secondary)]"
            aria-hidden="true"
          />
        </SettingsCard>
      ) : !stats ? (
        <SettingsCard className="p-6">
          <p className="text-sm font-semibold text-[var(--app-text-primary)]">
            Sem analytics ainda
          </p>
          <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
            Assim que mensagens, leads e vendas rodarem no workspace, os indicadores aparecem aqui.
          </p>
        </SettingsCard>
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
              <StatCard
                title="Receita paga"
                value={formatMoneyBRL(advanced.sales.totals.paidAmount || 0)}
              />
              <StatCard title="Vendas pagas" value={String(advanced.sales.totals.paidCount || 0)} />
              <StatCard
                title="Conversão"
                value={formatPct((advanced.sales.totals.conversionRate || 0) * 100)}
                hint="Pagas / total"
              />
              <StatCard title="Novos contatos" value={String(advanced.leads.newContacts || 0)} />
              <StatCard
                title="Flows concluídos"
                value={String(advanced.funnels.totals.completed || 0)}
              />
              <StatCard
                title="Conclusão de flow"
                value={formatPct((advanced.funnels.totals.completionRate || 0) * 100)}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SettingsCard>
              <SettingsHeader
                icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
                title="Atividade diária"
                className="mb-0"
              />
              <div className="mt-4 space-y-2">
                {activity.length === 0 ? (
                  <p className="text-sm text-[var(--app-text-secondary)]">
                    Sem atividade diária consolidada ainda.
                  </p>
                ) : (
                  activity.slice(-7).map((item) => (
                    <div
                      key={item.date}
                      className="flex items-center justify-between rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] px-4 py-3"
                    >
                      <span className="text-sm font-medium text-[var(--app-text-primary)]">
                        {formatShortDate(item.date)}
                      </span>
                      <div className="flex items-center gap-4 text-xs text-[var(--app-text-secondary)]">
                        <span>Entrada: {item.inbound}</span>
                        <span>Saída: {item.outbound}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <SettingsMetricTile>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">Inbound 7d</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {activityTotals.inbound}
                  </p>
                </SettingsMetricTile>
                <SettingsMetricTile>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">
                    Outbound 7d
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {activityTotals.outbound}
                  </p>
                </SettingsMetricTile>
              </div>
            </SettingsCard>

            <SettingsCard>
              <h4 className="font-semibold text-[var(--app-text-primary)]">
                Sentimento e lead score
              </h4>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <SettingsMetricTile>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">Positivo</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {stats.sentiment.positive}
                  </p>
                </SettingsMetricTile>
                <SettingsMetricTile>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">Neutro</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {stats.sentiment.neutral}
                  </p>
                </SettingsMetricTile>
                <SettingsMetricTile>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">Negativo</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {stats.sentiment.negative}
                  </p>
                </SettingsMetricTile>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <SettingsMetricTile>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">Lead alto</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {stats.leadScore.high}
                  </p>
                </SettingsMetricTile>
                <SettingsMetricTile>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">Lead médio</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {stats.leadScore.medium}
                  </p>
                </SettingsMetricTile>
                <SettingsMetricTile>
                  <p className="text-xs font-medium text-[var(--app-text-secondary)]">Lead baixo</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {stats.leadScore.low}
                  </p>
                </SettingsMetricTile>
              </div>
            </SettingsCard>
          </div>

          {advanced ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <SettingsCard>
                <h4 className="font-semibold text-[var(--app-text-primary)]">Inbox por status</h4>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {Object.entries(advanced.inbox.conversationsByStatus || {})
                    .slice(0, 8)
                    .map(([key, value]) => (
                      <SettingsMetricTile key={key}>
                        <p className="text-xs font-medium text-[var(--app-text-secondary)]">
                          {key}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                          {String(value)}
                        </p>
                      </SettingsMetricTile>
                    ))}
                </div>
              </SettingsCard>

              <SettingsCard>
                <h4 className="font-semibold text-[var(--app-text-primary)]">Top flows e filas</h4>
                <div className="mt-4 space-y-2">
                  {(advanced.funnels.topFlows || []).slice(0, 5).map((flow) => (
                    <div
                      key={flow.flowId}
                      className="flex items-center justify-between rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] px-4 py-3"
                    >
                      <span className="text-sm text-[var(--app-text-primary)]">
                        {flow.name || flow.flowId}
                      </span>
                      <span className="text-sm font-semibold text-[var(--app-text-primary)]">
                        {flow.executions}
                      </span>
                    </div>
                  ))}
                  {(advanced.queues.stats || []).slice(0, 4).map((queue) => (
                    <div
                      key={queue.id}
                      className="flex items-center justify-between rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] px-4 py-3"
                    >
                      <span className="text-sm text-[var(--app-text-primary)]">{queue.name}</span>
                      <span className="text-sm font-semibold text-[var(--app-text-primary)]">
                        {queue.waitingCount}
                      </span>
                    </div>
                  ))}
                </div>
              </SettingsCard>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
