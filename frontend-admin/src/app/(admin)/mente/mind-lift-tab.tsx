import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import type { AdminMindLiftResponse } from '@/lib/api/admin-mind-api';
import { DECISION_TYPE_OPTIONS, SINCE_DAYS_OPTIONS, liftTone } from './mind-admin.shared';

export function LiftTab({
  data,
  hasData,
  decisionType,
  sinceDays,
  onDecisionTypeChange,
  onSinceDaysChange,
}: {
  data: AdminMindLiftResponse | undefined;
  hasData: boolean;
  decisionType: string;
  sinceDays: number;
  onDecisionTypeChange: (value: string) => void;
  onSinceDaysChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Filtros"
          description="Escolha o tipo de decisão e a janela de análise para o lift."
        />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] text-[var(--app-text-tertiary)]">
              Tipo de decisão
            </label>
            <select
              value={decisionType}
              onChange={(event) => onDecisionTypeChange(event.target.value)}
              className="h-10 w-full max-w-xs rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
            >
              {DECISION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[var(--app-text-tertiary)]">Janela</label>
            <select
              value={sinceDays}
              onChange={(event) => onSinceDaysChange(Number(event.target.value))}
              className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
            >
              {SINCE_DAYS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </AdminSurface>

      {data ? (
        <AdminMetricGrid
          items={[
            {
              label: 'Decisões (n)',
              value: data.n,
              kind: 'integer',
              detail: 'Amostras resolvidas no período',
            },
            {
              label: 'Lift',
              value: data.lift,
              kind: 'integer',
              detail: `MIND μ=${data.mindMean.toFixed(3)} vs baseline μ=${data.baselineMean.toFixed(3)}`,
              tone: liftTone(data.lift),
            },
            {
              label: 'Z-Score',
              value: data.pZScore,
              kind: 'integer',
              detail:
                data.pZScore <= 0.05
                  ? 'Estatisticamente significativo (p≤0.05)'
                  : 'Não significativo',
              tone: data.pZScore <= 0.05 ? 'text-emerald-400' : 'text-[var(--app-text-secondary)]',
            },
            {
              label: 'Tipo de decisão',
              value: data.n,
              kind: 'integer',
              detail: `${data.decisionType} / ${data.sinceDays} dias`,
            },
          ]}
        />
      ) : null}

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Top ações escolhidas"
          description="Ações mais frequentes da Mente comparadas ao baseline."
        />
        {!data ? (
          <AdminEmptyState
            title="Carregando..."
            description="Aguardando dados de lift do backend."
          />
        ) : !hasData ? (
          <AdminEmptyState
            title="Nenhum dado de lift"
            description={`Nenhuma decisão resolvida para "${decisionType}" nos últimos ${sinceDays} dias.`}
          />
        ) : data.topChosenActions.length === 0 ? (
          <AdminEmptyState
            title="Nenhuma ação registrada"
            description="O backend retornou lift mas sem ações agregadas."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                <tr>
                  <th className="px-4 py-3">Ação MIND</th>
                  <th className="px-4 py-3">Baseline</th>
                  <th className="px-4 py-3 text-right">Outcome médio</th>
                  <th className="px-4 py-3 text-right">Contagem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border-primary)]">
                {data.topChosenActions.map((action, index) => (
                  <tr
                    key={`${action.chosen}-${action.baseline}-${index}`}
                    className="bg-[var(--app-bg-card)]"
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[var(--app-accent)]">
                        {action.chosen}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--app-text-secondary)]">{action.baseline}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="text-[var(--app-text-primary)]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {action.outcome.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--app-text-primary)]">
                      {action.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSurface>
    </div>
  );
}
