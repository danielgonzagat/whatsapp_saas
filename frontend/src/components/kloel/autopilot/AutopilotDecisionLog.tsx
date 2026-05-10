'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  XCircle,
  Calendar,
} from 'lucide-react';

export interface AutopilotActionLike {
  id?: string;
  createdAt: string;
  contactId?: string;
  contact?: string;
  intent?: string;
  action?: string;
  status?: string;
  reason?: string;
}

export interface AutopilotImpactLike {
  workspaceId: string;
  actionsAnalyzed: number;
  repliedContacts: number;
  totalReplies: number;
  replyRate: number;
  conversions: number;
  conversionRate: number;
  avgReplyMinutes: number | null;
  samples: Array<{
    contactId: string;
    contact: string;
    replyAt: string;
    delayMinutes: number;
  }>;
}

function ActionRow({ action }: { action: AutopilotActionLike }) {
  const statusColors: Record<string, string> = {
    success: colors.brand.green,
    error: colors.semantic.error,
    skipped: colors.brand.cyan,
    scheduled: colors.semantic.warning,
  };

  const statusIcons: Record<string, React.ElementType> = {
    success: CheckCircle2,
    error: XCircle,
    skipped: Clock,
    scheduled: Calendar,
  };
  const statusKey = action.status || 'unknown';
  const StatusIcon = statusIcons[statusKey] || Activity;
  const statusColor = statusColors[statusKey] || colors.text.muted;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-lg border transition-all hover:bg-white/5"
      style={{
        backgroundColor: colors.background.surface2,
        borderColor: colors.stroke,
      }}
    >
      <div className="p-2 rounded-full" style={{ backgroundColor: `${statusColor}20` }}>
        <StatusIcon size={16} style={{ color: statusColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate" style={{ color: colors.text.primary }}>
            {action.contact || action.contactId?.slice(0, 8)}
          </span>
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: `${colors.brand.cyan}20`,
              color: colors.brand.cyan,
            }}
          >
            {action.intent}
          </span>
        </div>
        <div className="text-sm truncate" style={{ color: colors.text.muted }}>
          {action.action}
          {action.reason && ` — ${action.reason}`}
        </div>
      </div>
      <div className="text-xs whitespace-nowrap" style={{ color: colors.text.muted }}>
        {new Date(action.createdAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
}

export default function AutopilotDecisionLog({
  actions,
  impact,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onExport,
  isLoading,
  isEnabled,
}: {
  actions: AutopilotActionLike[];
  impact: AutopilotImpactLike | null;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  isLoading: boolean;
  isEnabled?: boolean;
}) {
  const filteredActions = actions.filter((a) =>
    statusFilter === 'all' ? true : a.status === statusFilter,
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
          {kloelT(`Ações Recentes`)}
        </h2>
        <div className="flex items-center gap-2">
          <Filter size={16} style={{ color: colors.text.muted }} aria-hidden="true" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm border outline-none"
            style={{
              backgroundColor: colors.background.surface2,
              borderColor: colors.stroke,
              color: colors.text.primary,
            }}
          >
            <option value="all">{kloelT(`Todos`)}</option>
            <option value="success">{kloelT(`Sucesso`)}</option>
            <option value="error">{kloelT(`Erros`)}</option>
            <option value="skipped">{kloelT(`Ignorados`)}</option>
            <option value="scheduled">{kloelT(`Agendados`)}</option>
          </select>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: colors.text.muted }}
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="space-y-2 mb-8">
        {filteredActions.length === 0 ? (
          <div
            className="p-8 rounded-xl text-center"
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <Bot size={48} className="mx-auto mb-4" style={{ color: colors.text.muted }} aria-hidden="true" />
            <p style={{ color: colors.text.muted }}>
              {statusFilter === 'all'
                ? 'Nenhuma ação registrada ainda'
                : `Nenhuma ação com status "${statusFilter}"`}
            </p>
            {!isEnabled && (
              <p className="mt-2 text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Ative o Autopilot para começar a automatizar`)}
              </p>
            )}
          </div>
        ) : (
          filteredActions.map((action) => <ActionRow key={action.id} action={action} />)
        )}
      </div>

      {actions.length >= 50 && (
        <div className="mb-8 text-center">
          <Button variant="ghost" size="sm" onClick={onExport}>
            <ArrowUpRight size={16} className="mr-2" aria-hidden="true" />
            {kloelT(`Exportar todas as ações`)}
          </Button>
        </div>
      )}

      {impact && impact.samples.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-4" style={{ color: colors.text.primary }}>
            {kloelT(`Exemplos de Impacto`)}
          </h2>
          <div
            className="p-4 rounded-xl"
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <div className="space-y-3">
              {impact.samples.map((sample) => (
                <div
                  key={sample.contact}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <div>
                    <span className="font-medium" style={{ color: colors.text.primary }}>
                      {sample.contact}
                    </span>
                    <span className="text-sm ml-2" style={{ color: colors.text.muted }}>
                      {kloelT(`respondeu em`)} {sample.delayMinutes} min
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: colors.text.muted }}>
                    {new Date(sample.replyAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
