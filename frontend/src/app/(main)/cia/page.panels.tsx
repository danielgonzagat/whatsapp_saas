'use client';

import { kloelT } from '@/lib/i18n/t';
import type {
  CiaAccountApproval,
  CiaAccountRuntime,
  CiaInputSession,
  CiaWorkItem,
} from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Badge, Button, Surface } from '@/components/kloel';
import { Activity, CheckCircle, ClipboardList, XCircle } from 'lucide-react';
import { formatTs, workItemStateBadgeVariant, PATTERN_RE_2 } from './page.helpers';

interface AccountRuntimePanelProps {
  accountRuntime: CiaAccountRuntime;
}

export function AccountRuntimePanel({ accountRuntime }: AccountRuntimePanelProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
          <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
            {kloelT('Agent Runtime')}
          </p>
        </div>
        <Badge variant={accountRuntime.noLegalActions ? 'warning' : 'success'}>
          {accountRuntime.mode}
        </Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Aprovações abertas', value: accountRuntime.openApprovalCount },
          { label: 'Inputs pendentes', value: accountRuntime.pendingInputCount },
          { label: 'Work items ativos', value: accountRuntime.openWorkItemCount },
          { label: 'Aprovações concluídas', value: accountRuntime.completedApprovalCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded p-3"
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <p className="text-2xl font-bold font-mono" style={{ color: colors.text.primary }}>
              {stat.value}
            </p>
            <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>
      {accountRuntime.noLegalActions && (
        <div
          className="mt-4 rounded p-3"
          style={{
            backgroundColor: `${colors.state.warning}12`,
            border: `1px solid ${colors.state.warning}40`,
          }}
        >
          <p className="text-sm" style={{ color: colors.state.warning }}>
            {kloelT('Universo de ações esgotado — nenhuma ação legal disponível no momento.')}
          </p>
        </div>
      )}
    </Surface>
  );
}

interface AccountApprovalsPanelProps {
  approvals: CiaAccountApproval[];
  openApprovals: CiaAccountApproval[];
  approvalPendingId: string | null;
  workspaceLoading: boolean;
  onApprove: (a: CiaAccountApproval) => void;
  onReject: (a: CiaAccountApproval) => void;
}

export function AccountApprovalsPanel({
  approvals,
  openApprovals,
  approvalPendingId,
  workspaceLoading,
  onApprove,
  onReject,
}: AccountApprovalsPanelProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
        <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
          {kloelT('Aprovações de Conta')}
        </p>
        {openApprovals.length > 0 && (
          <Badge variant="warning">{openApprovals.length} abertas</Badge>
        )}
      </div>

      {approvals.length === 0 ? (
        <div
          className="rounded p-4"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
            {kloelT('Nenhuma aprovação pendente')}
          </p>
          <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
            {kloelT('O agente não detectou lacunas no catálogo que exijam criação de produto.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="rounded p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                    {approval.requestedProductName}
                  </p>
                  <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                    {approval.operatorPrompt}
                  </p>
                  {approval.phone && (
                    <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                      {approval.phone}
                      {approval.contactName ? ` • ${approval.contactName}` : ''}
                    </p>
                  )}
                  <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                    {kloelT('Detectado:')} {formatTs(approval.firstDetectedAt)}
                  </p>
                </div>
                <Badge
                  variant={
                    approval.status === 'OPEN'
                      ? 'warning'
                      : approval.status === 'APPROVED'
                        ? 'success'
                        : approval.status === 'COMPLETED'
                          ? 'info'
                          : 'error'
                  }
                >
                  {approval.status}
                </Badge>
              </div>

              {approval.status === 'OPEN' && (
                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={() => onApprove(approval)}
                    isLoading={approvalPendingId === approval.id}
                    disabled={workspaceLoading}
                    leftIcon={<CheckCircle size={14} aria-hidden="true" />}
                  >
                    {kloelT('Aprovar criação')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onReject(approval)}
                    disabled={approvalPendingId === approval.id || workspaceLoading}
                    leftIcon={<XCircle size={14} aria-hidden="true" />}
                  >
                    {kloelT('Rejeitar')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}

interface InputSessionsPanelProps {
  inputSessions: CiaInputSession[];
  pendingSessions: CiaInputSession[];
  sessionAnswers: Record<string, string>;
  setSessionAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  sessionPendingId: string | null;
  workspaceLoading: boolean;
  onRespond: (s: CiaInputSession) => void;
}

export function InputSessionsPanel({
  inputSessions,
  pendingSessions,
  sessionAnswers,
  setSessionAnswers,
  sessionPendingId,
  workspaceLoading,
  onRespond,
}: InputSessionsPanelProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
        <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
          {kloelT('Coleta de Informações')}
        </p>
        {pendingSessions.length > 0 && (
          <Badge variant="warning">{pendingSessions.length} aguardando</Badge>
        )}
      </div>

      {inputSessions.length === 0 ? (
        <div
          className="rounded p-4"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
            {kloelT('Nenhuma sessão de input ativa')}
          </p>
          <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
            {kloelT(
              'Quando o agente precisar de informações para criar um produto, as sessões aparecem aqui.',
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {inputSessions.map((session) => (
            <div
              key={session.id}
              className="rounded p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                    {session.productName}
                  </p>
                  {session.currentPrompt && (
                    <p className="text-sm mt-2" style={{ color: colors.text.secondary }}>
                      {session.currentPrompt}
                    </p>
                  )}
                  {session.phone && (
                    <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                      {session.phone}
                      {session.contactName ? ` • ${session.contactName}` : ''}
                    </p>
                  )}
                </div>
                <Badge variant={session.status === 'COMPLETED' ? 'success' : 'warning'}>
                  {session.status.replace(PATTERN_RE_2, ' ')}
                </Badge>
              </div>

              {session.status !== 'COMPLETED' && (
                <div className="mt-3">
                  <textarea
                    value={sessionAnswers[session.id] ?? ''}
                    onChange={(e) =>
                      setSessionAnswers((prev) => ({
                        ...prev,
                        [session.id]: e.target.value,
                      }))
                    }
                    placeholder={kloelT('Sua resposta...')}
                    className="w-full rounded border px-3 py-2 text-sm outline-none"
                    style={{
                      backgroundColor: colors.background.base,
                      color: colors.text.primary,
                      borderColor: colors.stroke,
                    }}
                    rows={3}
                  />
                  <Button
                    className="mt-2"
                    onClick={() => onRespond(session)}
                    isLoading={sessionPendingId === session.id}
                    disabled={workspaceLoading || !sessionAnswers[session.id]?.trim()}
                  >
                    {kloelT('Responder')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}

interface WorkItemsPanelProps {
  workItems: CiaWorkItem[];
  activeWorkItems: CiaWorkItem[];
}

export function WorkItemsPanel({ workItems, activeWorkItems }: WorkItemsPanelProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
        <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
          {kloelT('Work Items do Agente')}
        </p>
        {activeWorkItems.length > 0 && (
          <Badge variant="info">{activeWorkItems.length} ativos</Badge>
        )}
      </div>

      {workItems.length === 0 ? (
        <div
          className="rounded p-4"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
            {kloelT('Nenhum work item no momento')}
          </p>
          <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
            {kloelT('O agente não possui tarefas pendentes no universo atual.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {workItems.map((item) => (
            <div
              key={item.id}
              className="rounded p-3 flex items-start justify-between gap-3"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                  {item.title}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                  {item.summary}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                  {item.entityType} {kloelT('• prioridade')} {item.priority}
                </p>
              </div>
              <div className="flex-shrink-0">
                <Badge variant={workItemStateBadgeVariant(item.state)}>
                  {item.state.replace(PATTERN_RE_2, ' ')}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}
