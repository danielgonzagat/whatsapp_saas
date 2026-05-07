import {
  AdminEmptyState,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import type { AdminMindSurpriseResponse } from '@/lib/api/admin-mind-api';
import {
  SURPRISE_LIMIT_OPTIONS,
  formatHorizon,
  formatSurprise,
  severityBadge,
} from './mind-admin.shared';

export function SurpriseTab({
  data,
  hasData,
  limit,
  onLimitChange,
}: {
  data: AdminMindSurpriseResponse | undefined;
  hasData: boolean;
  limit: number;
  onLimitChange: (limit: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Filtros"
          description="Ajuste o limite de eventos de surpresa recentes."
        />
        <div className="flex items-center gap-3">
          <label className="text-[12px] text-[var(--app-text-secondary)]">Limite:</label>
          <select
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
          >
            {SURPRISE_LIMIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Eventos de surpresa"
          description={
            data
              ? `${data.total} eventos resolvidos com surpresa mensurada. Workspace: ${data.workspaceName}`
              : 'Carregando...'
          }
        />
        {!data ? (
          <AdminEmptyState
            title="Carregando..."
            description="Aguardando dados de surpresa do backend."
          />
        ) : !hasData ? (
          <AdminEmptyState
            title="Nenhum evento de surpresa"
            description="Nenhuma predição resolvida com surpresa registrada para este workspace."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--app-border-primary)]">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[var(--app-bg-secondary)] text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                <tr>
                  <th className="px-4 py-3">Sujeito</th>
                  <th className="px-4 py-3">Predicado</th>
                  <th className="px-4 py-3 text-right">Previsto μ</th>
                  <th className="px-4 py-3 text-right">Real</th>
                  <th className="px-4 py-3 text-right">Surpresa</th>
                  <th className="px-4 py-3">Severidade</th>
                  <th className="px-4 py-3 text-right">Horizonte</th>
                  <th className="px-4 py-3 text-right">Resolvido em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border-primary)]">
                {data.items.map((item) => (
                  <tr key={item.id} className="bg-[var(--app-bg-card)]">
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-[var(--app-text-primary)]">
                        {item.subject}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] text-[var(--app-text-secondary)]">
                        {item.predicate}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="text-[var(--app-text-primary)]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {item.predictedMean.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="text-[var(--app-text-primary)]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {item.actual !== null ? item.actual.toFixed(3) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          (item.surprise ?? 0) >= 1.0
                            ? 'font-semibold text-amber-400'
                            : 'text-[var(--app-text-secondary)]'
                        }
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {formatSurprise(item.surprise)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{severityBadge(item.severity)}</td>
                    <td className="px-4 py-3 text-right text-[var(--app-text-secondary)]">
                      {formatHorizon(item.horizonSec)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--app-text-secondary)]">
                      {item.resolvedAt ? new Date(item.resolvedAt).toLocaleString('pt-BR') : '—'}
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
