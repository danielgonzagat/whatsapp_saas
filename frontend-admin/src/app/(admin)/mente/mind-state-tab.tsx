import { Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import type { AdminMindStateResponse } from '@/lib/api/admin-mind-api';
import { formatMean } from './mind-admin.shared';

export function StateTab({
  data,
}: {
  data: AdminMindStateResponse | undefined;
  workspaceName: string;
}) {
  if (!data) {
    return (
      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminEmptyState
          title="Carregando estado da mente..."
          description="Aguardando resposta do backend para o workspace selecionado."
        />
      </AdminSurface>
    );
  }

  const { beliefSummary, predictionSummary, policySummary, topConversionBeliefs } = data;

  return (
    <div className="flex flex-col gap-4">
      <AdminMetricGrid
        items={[
          {
            label: 'Predicados de crença',
            value: beliefSummary.totalPredicates,
            kind: 'integer',
            detail: 'Tipos únicos de crença Bayesianos rastreados',
          },
          {
            label: 'Predições registradas',
            value: predictionSummary.total,
            kind: 'integer',
            detail: `${predictionSummary.resolved} resolvidas, ${predictionSummary.open} abertas`,
          },
          {
            label: 'Surpresa média',
            value: predictionSummary.avgSurprise,
            kind: 'integer',
            detail: `${predictionSummary.highSurpriseCount} eventos de alta surpresa (>=1.0)`,
            tone: predictionSummary.highSurpriseCount > 0 ? 'text-amber-400' : undefined,
          },
          {
            label: 'Decisões de política',
            value: policySummary.total,
            kind: 'integer',
            detail: `${policySummary.resolved} resolvidas, ${policySummary.unresolved} pendentes`,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Agregados de crença"
            description="Distribuição de crenças por predicado com média e amostras."
          />
          {beliefSummary.predicates.length === 0 ? (
            <AdminEmptyState
              title="Nenhuma crença registrada"
              description="O workspace ainda não possui crenças Bayesianas. Execute um tick da Mente para gerar."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  <tr>
                    <th className="px-4 py-3">Predicado</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Mín amostras</th>
                    <th className="px-4 py-3 text-right">Máx amostras</th>
                    <th className="px-4 py-3 text-right">Média μ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border-primary)]">
                  {beliefSummary.predicates.map((row) => (
                    <tr key={row.predicate} className="bg-[var(--app-bg-card)]">
                      <td className="px-4 py-3">
                        <span className="font-mono text-[12px] text-[var(--app-text-primary)]">
                          {row.predicate}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--app-text-primary)]">
                        {row.total}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--app-text-secondary)]">
                        {row.minSamples}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--app-text-secondary)]">
                        {row.maxSamples}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-semibold text-[var(--app-text-primary)]"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {formatMean(row.avgMean)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminSurface>

        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Top crenças de conversão"
            description="Maiores médias para P(conversion|segment,price_band,channel,hour)."
          />
          {topConversionBeliefs.length === 0 ? (
            <AdminEmptyState
              title="Nenhuma crença de conversão"
              description="Sem dados de conversão registrados para este workspace."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  <tr>
                    <th className="px-4 py-3">Sujeito</th>
                    <th className="px-4 py-3 text-right">Média μ</th>
                    <th className="px-4 py-3 text-right">Variância</th>
                    <th className="px-4 py-3 text-right">Amostras</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border-primary)]">
                  {topConversionBeliefs.map((belief, index) => (
                    <tr key={`${belief.subject}-${index}`} className="bg-[var(--app-bg-card)]">
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-[var(--app-text-primary)]">
                          {belief.subject}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-semibold text-[var(--app-accent)]"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {formatMean(belief.mean)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="text-[var(--app-text-secondary)]"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {belief.variance.toFixed(4)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--app-text-primary)]">
                        {belief.samples}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminSurface>
      </div>

      {policySummary.decisionTypes.length > 0 ? (
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Tipos de decisão ativos"
            description="Tipos de decisão com políticas registradas neste workspace."
          />
          <div className="flex flex-wrap gap-2">
            {policySummary.decisionTypes.map((dt) => (
              <Badge key={dt} variant="outline">
                <Zap size={12} className="mr-1" />
                {dt}
              </Badge>
            ))}
          </div>
        </AdminSurface>
      ) : null}
    </div>
  );
}
