// Connect payout approval — typed payload and summary contracts
// Extracted from connect-payout-approval.service.ts for architecture guardrail

export const CONNECT_PAYOUT_APPROVAL_KIND = 'connect_payout';

/** Connect payout approval payload (persisted in approvalRequest.payload). */
export interface ConnectPayoutApprovalPayload {
  /** Schema version. */
  version: 1;
  /** Workspace id property. */
  workspaceId: string;
  /** Account balance id property. */
  accountBalanceId: string;
  /** Account type property. */
  accountType: string;
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Amount cents property (string for json safety). */
  amountCents: string;
  /** Currency property. */
  currency: string;
  /** Request id property. */
  requestId: string;
  /** Requested by type property. */
  requestedByType: 'workspace';
}

/** Connect payout approval decision shape. */
export interface ConnectPayoutApprovalDecision {
  /** Payout id property. */
  payoutId?: string | null;
  /** Status property. */
  status?: string | null;
  /** Amount cents property. */
  amountCents: string;
  /** Currency property. */
  currency: string;
  /** Approved by admin id property. */
  approvedByAdminId?: string | null;
  /** Rejected by admin id property. */
  rejectedByAdminId?: string | null;
  /** Reason property. */
  reason?: string | null;
  /** Error property. */
  error?: string | null;
}

/** Create connect payout approval input shape. */
export interface CreateConnectPayoutApprovalInput {
  /** Workspace id property. */
  workspaceId: string;
  /** Account balance id property. */
  accountBalanceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Currency property. */
  currency?: string;
}

/** Connect payout approval summary shape. */
export interface ConnectPayoutApprovalSummary {
  /** Approval request id property. */
  approvalRequestId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Account balance id property. */
  accountBalanceId: string;
  /** Account type property. */
  accountType: string;
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Amount cents property. */
  amountCents: string;
  /** Currency property. */
  currency: string;
  /** Request id property. */
  requestId: string;
  /** State property. */
  state: string;
  /** Title property. */
  title: string;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Responded at property. */
  respondedAt: string | null;
  /** Decision property. */
  decision: ConnectPayoutApprovalDecision | null;
}
