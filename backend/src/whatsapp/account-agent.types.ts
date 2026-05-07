/**
 * Shared type declarations for the Account Agent module.
 *
 * Extracted from account-agent.service.ts so the service stays under the
 * architecture line-count guardrail and so the parsers module can consume
 * the types without importing runtime service code.
 */

export type ApprovalStatus = 'OPEN' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export type InputSessionStatus =
  | 'WAITING_DESCRIPTION'
  | 'WAITING_OFFERS'
  | 'WAITING_COMPANY'
  | 'COMPLETED';

/** Account approval payload shape. */
export interface AccountApprovalPayload {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: 'product_creation';
  /** Status property. */
  status: ApprovalStatus;
  /** Requested product name property. */
  requestedProductName: string;
  /** Normalized product name property. */
  normalizedProductName: string;
  /** Contact id property. */
  contactId: string | null;
  /** Contact name property. */
  contactName: string | null;
  /** Phone property. */
  phone: string | null;
  /** Conversation id property. */
  conversationId: string | null;
  /** Customer message property. */
  customerMessage: string;
  /** Operator prompt property. */
  operatorPrompt: string;
  /** Source property. */
  source: 'inbound_catalog_gap';
  /** First detected at property. */
  firstDetectedAt: string;
  /** Last detected at property. */
  lastDetectedAt: string;
  /** Input session id property. */
  inputSessionId?: string | null;
  /** Materialized product id property. */
  materializedProductId?: string | null;
}

/** Account input session payload shape. */
export interface AccountInputSessionPayload {
  /** Id property. */
  id: string;
  /** Approval id property. */
  approvalId: string;
  /** Kind property. */
  kind: 'product_creation';
  /** Status property. */
  status: InputSessionStatus;
  /** Product name property. */
  productName: string;
  /** Normalized product name property. */
  normalizedProductName: string;
  /** Contact id property. */
  contactId: string | null;
  /** Contact name property. */
  contactName: string | null;
  /** Phone property. */
  phone: string | null;
  /** Customer message property. */
  customerMessage: string;
  /** Answers property. */
  answers: {
    description?: string | null;
    offers?: string | null;
    company?: string | null;
  };
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Completed at property. */
  completedAt?: string | null;
  /** Materialized product id property. */
  materializedProductId?: string | null;
}

/** Account approval list item shape. */
export interface AccountApprovalListItem extends AccountApprovalPayload {
  /** Memory id property. */
  memoryId: string;
  /** Approval request id property. */
  approvalRequestId: string;
  /** Canonical property. */
  canonical: true;
  /** Responded at property. */
  respondedAt: string | null;
}

/** Account input session list item shape. */
export interface AccountInputSessionListItem extends AccountInputSessionPayload {
  /** Memory id property. */
  memoryId: string;
  /** Input collection session id property. */
  inputCollectionSessionId: string;
  /** Canonical property. */
  canonical: true;
  /** Current prompt property. */
  currentPrompt: string;
}
