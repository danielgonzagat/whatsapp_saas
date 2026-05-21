'use client';

import { kloelT } from '@/lib/i18n/t';
import { Badge, Button, Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { formatTs } from '../utils';
import { CheckCircle, XCircle } from 'lucide-react';
import type { CiaAccountApproval } from '@/lib/api';

interface CiaAccountApprovalsProps {
  approvals: CiaAccountApproval[];
  openApprovals: CiaAccountApproval[];
  approvalPendingId: string | null;
  workspaceLoading: boolean;
  onApprove: (approval: CiaAccountApproval) => void;
  onReject: (approval: CiaAccountApproval) => void;
}

export function CiaAccountApprovals({
  approvals,
  openApprovals,
  approvalPendingId,
  workspaceLoading,
  onApprove,
  onReject,
}: CiaAccountApprovalsProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
        <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
          {kloelT('Aprovacoes de Conta')}
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
            {kloelT('Nenhuma aprovacao pendente')}
          </p>
          <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
            {kloelT('O agente nao detectou lacunas no catalogo que exijam criacao de produto.')}
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
                      {approval.contactName ? ` \u2022 ${approval.contactName}` : ''}
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
                    onClick={() => void onApprove(approval)}
                    isLoading={approvalPendingId === approval.id}
                    disabled={workspaceLoading}
                    leftIcon={<CheckCircle size={14} aria-hidden="true" />}
                  >
                    {kloelT('Aprovar criacao')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void onReject(approval)}
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
