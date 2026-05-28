// Cia account runtime + work item + capability registry type definitions.
// Extracted from cia.types.ts as part of the gate-fix-D split (keep each
// file <= 400 LOC). The barrel `cia.types.ts` re-exports every symbol below
// so existing consumers continue to compile without modification.

/** Cia account approval shape. */
export interface CiaAccountApproval {
  /** Id property. */
  id: string;
  /** Memory id property. */
  memoryId?: string;
  /** Approval request id property. */
  approvalRequestId?: string;
  /** Kind property. */
  kind: string;
  /** Status property. */
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
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
  /** Contact message property. */
  contactMessage: string;
  /** Operator prompt property. */
  operatorPrompt: string;
  /** Source property. */
  source: string;
  /** First detected at property. */
  firstDetectedAt: string;
  /** Last detected at property. */
  lastDetectedAt: string;
  /** Input session id property. */
  inputSessionId?: string | null;
  /** Materialized product id property. */
  materializedProductId?: string | null;
  /** Responded at property. */
  respondedAt?: string | null;
}

/** Cia input session shape. */
export interface CiaInputSession {
  /** Id property. */
  id: string;
  /** Memory id property. */
  memoryId?: string;
  /** Input collection session id property. */
  inputCollectionSessionId?: string;
  /** Approval id property. */
  approvalId: string;
  /** Kind property. */
  kind: string;
  /** Status property. */
  status: 'WAITING_DESCRIPTION' | 'WAITING_OFFERS' | 'WAITING_COMPANY' | 'COMPLETED';
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
  /** Contact message property. */
  contactMessage: string;
  /** Current prompt property. */
  currentPrompt?: string;
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

/** Cia work item shape. */
export interface CiaWorkItem {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: string;
  /** Entity type property. */
  entityType: string;
  /** Entity id property. */
  entityId: string;
  /** State property. */
  state: 'OPEN' | 'WAITING_APPROVAL' | 'WAITING_INPUT' | 'BLOCKED' | 'COMPLETED';
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Priority property. */
  priority: number;
  /** Utility property. */
  utility: number;
  /** Requires approval property. */
  requiresApproval: boolean;
  /** Requires input property. */
  requiresInput: boolean;
  /** Approval state property. */
  approvalState?: string | null;
  /** Input state property. */
  inputState?: string | null;
  /** Blocked by property. */
  blockedBy?: Record<string, unknown> | null;
  /** Evidence property. */
  evidence?: Record<string, unknown> | null;
  /** Metadata property. */
  metadata?: Record<string, unknown> | null;
  /** Created at property. */
  createdAt?: string;
  /** Updated at property. */
  updatedAt?: string;
}

/** Cia account runtime shape. */
export interface CiaAccountRuntime {
  /** Objective property. */
  objective: string;
  /** Mode property. */
  mode: string;
  /** Open approval count property. */
  openApprovalCount: number;
  /** Pending input count property. */
  pendingInputCount: number;
  /** Completed approval count property. */
  completedApprovalCount: number;
  /** Open approvals property. */
  openApprovals: CiaAccountApproval[];
  /** Pending inputs property. */
  pendingInputs: CiaInputSession[];
  /** Work items property. */
  workItems: CiaWorkItem[];
  /** Open work item count property. */
  openWorkItemCount: number;
  /** No legal actions property. */
  noLegalActions: boolean;
  /** No legal action reasons property. */
  noLegalActionReasons: string[];
  /** Capability registry version property. */
  capabilityRegistryVersion: string;
  /** Capability count property. */
  capabilityCount: number;
  /** Conversation action registry version property. */
  conversationActionRegistryVersion: string;
  /** Conversation action count property. */
  conversationActionCount: number;
  /** Last meaningful action at property. */
  lastMeaningfulActionAt: string | null;
}

/** Cia capability registry item shape. */
export interface CiaCapabilityRegistryItem {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Description property. */
  description?: string;
  /** Category property. */
  category?: string;
  [key: string]: unknown;
}

/** Cia capability registry shape. */
export interface CiaCapabilityRegistry {
  /** Version property. */
  version: string;
  /** Items property. */
  items: CiaCapabilityRegistryItem[];
}

/** Cia conversation action registry shape. */
export interface CiaConversationActionRegistry {
  /** Version property. */
  version: string;
  /** Items property. */
  items: CiaCapabilityRegistryItem[];
}
