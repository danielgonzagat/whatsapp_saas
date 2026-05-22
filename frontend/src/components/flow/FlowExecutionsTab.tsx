'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { FlowExecutionSummary } from '@/lib/api/flows';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { RotateCw, RotateCcw } from 'lucide-react';

interface FlowExecutionsTabProps {
  executions: FlowExecutionSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onRetry: (executionId: string) => void;
}

export function FlowExecutionsTab({
  executions,
  loading,
  error,
  onRefresh,
  onRetry,
}: FlowExecutionsTabProps) {
  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">
          {kloelT('Historico de Execucoes')}
        </h2>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-[var(--semantic-error)]">{error}</span>}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {loading ? (
              <KloelMushroomMark
                size={18}
                title="Atualizando execucoes"
                traceColor={colors.ember.primary}
              />
            ) : (
              <RotateCw className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {loading && executions.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <KloelMushroomMark
            size={18}
            title="Carregando execucoes"
            traceColor={colors.ember.primary}
          />
          {kloelT('Carregando execucoes...')}
        </div>
      ) : executions.length === 0 ? (
        <div className="text-muted-foreground">{kloelT('Nenhuma execucao encontrada.')}</div>
      ) : (
        <div className="space-y-3">
          {executions.map((exec) => (
            <div
              key={exec.id}
              className="p-4 border border-border rounded-md flex items-center justify-between"
              style={{ backgroundColor: 'var(--app-bg-card)' }}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {exec.flow?.name || 'Fluxo'}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      exec.status === 'COMPLETED'
                        ? 'bg-[var(--semantic-success)]/10 text-[var(--semantic-success)]'
                        : exec.status === 'FAILED'
                          ? 'bg-[var(--semantic-error)]/10 text-[var(--semantic-error)]'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {exec.status || 'Desconhecido'}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {exec.contact?.name || exec.contact?.phone || 'Contato desconhecido'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {kloelT('Iniciado em')} {new Date(exec.createdAt).toLocaleString('pt-BR')}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {exec.status === 'FAILED' && (
                  <button
                    type="button"
                    onClick={() => onRetry(exec.id)}
                    className="px-3 py-2 text-sm rounded-md border border-border text-muted-foreground hover:bg-muted"
                  >
                    <RotateCcw className="w-4 h-4 mr-1 inline" aria-hidden="true" />
                    {kloelT('Reprocessar')}
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {kloelT('Atualizado')} {new Date(exec.updatedAt).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
