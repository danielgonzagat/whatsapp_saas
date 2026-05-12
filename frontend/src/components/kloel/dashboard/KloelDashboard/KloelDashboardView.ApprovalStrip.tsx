'use client';

import type { KloelApprovalDecision, KloelApprovalRequest } from '@/lib/api/kloel';
import { CHAT_MAX_WIDTH, DIVIDER, EMBER, MUTED, SURFACE, TEXT, V } from '../KloelDashboard.subcomponents';

function ApprovalDecisionButton({
  approvalId,
  decision,
  children,
  inFlight,
  onApprovalDecision,
}: {
  approvalId: string;
  decision: KloelApprovalDecision;
  children: string;
  inFlight: string | null;
  onApprovalDecision: (approvalRequestId: string, decision: KloelApprovalDecision) => Promise<void>;
}) {
  const isBusy = inFlight === `${approvalId}:${decision}`;
  return (
    <button
      type="button"
      disabled={Boolean(inFlight)}
      onClick={() => {
        void onApprovalDecision(approvalId, decision);
      }}
      style={{
        minHeight: 34,
        borderRadius: 6,
        border: `1px solid ${decision === 'approve' ? EMBER : DIVIDER}`,
        background: decision === 'approve' ? EMBER : SURFACE,
        color: decision === 'approve' ? 'rgb(10, 10, 12)' : TEXT,
        padding: '0 12px',
        fontSize: 12,
        fontWeight: 700,
        cursor: inFlight ? 'wait' : 'pointer',
        opacity: inFlight && !isBusy ? 0.45 : 1,
      }}
    >
      {isBusy ? 'Salvando' : children}
    </button>
  );
}

export function PendingApprovalsStrip({
  approvals,
  loading,
  inFlight,
  onApprovalDecision,
}: {
  approvals: KloelApprovalRequest[];
  loading: boolean;
  inFlight: string | null;
  onApprovalDecision: (approvalRequestId: string, decision: KloelApprovalDecision) => Promise<void>;
}) {
  if (!loading && approvals.length === 0) {
    return null;
  }
  const visibleApprovals = approvals.slice(0, 3);
  return (
    <div
      aria-live="polite"
      style={{
        width: '100%',
        borderTop: `1px solid ${DIVIDER}`,
        borderBottom: `1px solid ${DIVIDER}`,
        background: `color-mix(in srgb, ${SURFACE} 90%, ${V})`,
        padding: '10px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: CHAT_MAX_WIDTH,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <strong style={{ fontSize: 12, letterSpacing: 0, color: TEXT }}>
            Aprovacoes pendentes
          </strong>
          <span style={{ fontSize: 12, color: MUTED }}>
            {loading ? 'Atualizando' : `${approvals.length} em aberto`}
          </span>
        </div>
        {visibleApprovals.map((approval) => (
          <div
            key={approval.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: TEXT,
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {approval.title}
              </div>
              <div
                style={{
                  color: MUTED,
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {approval.prompt}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <ApprovalDecisionButton
                approvalId={approval.id}
                decision="approve"
                inFlight={inFlight}
                onApprovalDecision={onApprovalDecision}
              >
                Aprovar
              </ApprovalDecisionButton>
              <ApprovalDecisionButton
                approvalId={approval.id}
                decision="adjust"
                inFlight={inFlight}
                onApprovalDecision={onApprovalDecision}
              >
                Ajustar
              </ApprovalDecisionButton>
              <ApprovalDecisionButton
                approvalId={approval.id}
                decision="reject"
                inFlight={inFlight}
                onApprovalDecision={onApprovalDecision}
              >
                Rejeitar
              </ApprovalDecisionButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
