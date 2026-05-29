/**
 * Pure helpers extracted from `account-agent.service.ts`.
 *
 * These functions take plain inputs and return plain outputs — no Prisma,
 * no logging, no I/O. They isolate the shape-construction logic from the
 * service so it can be tested without any DI/mocks and so the service file
 * stays under the architecture line-count guardrail.
 */
import {
  ACCOUNT_CAPABILITY_REGISTRY,
  ACCOUNT_CAPABILITY_REGISTRY_VERSION,
  CONVERSATION_ACTION_REGISTRY,
  CONVERSATION_ACTION_REGISTRY_VERSION,
} from './account-agent.registry';
import type {
  AccountApprovalListItem,
  AccountApprovalPayload,
  AccountInputSessionListItem,
  AccountInputSessionPayload,
} from './account-agent.types';
import type { WorkItemUpsertInput } from './account-agent.work-items';

/** Active work-item states for runtime aggregation. */
export const ACTIVE_WORK_ITEM_STATES: readonly string[] = [
  'OPEN',
  'WAITING_APPROVAL',
  'WAITING_INPUT',
  'BLOCKED',
];

/**
 * Map an approval status to the work-item state used when materialising a
 * `catalog_gap_detected` work item from a freshly-detected catalog gap.
 */
export function approvalStatusToWorkItemState(
  status: AccountApprovalPayload['status'],
): 'COMPLETED' | 'BLOCKED' | 'WAITING_APPROVAL' {
  if (status === 'REJECTED') {
    return 'BLOCKED';
  }
  if (status === 'COMPLETED') {
    return 'COMPLETED';
  }
  return 'WAITING_APPROVAL';
}

/**
 * Build the work-item upsert payload emitted by `detectCatalogGap` when a
 * brand-new approval is created. The resulting object is a `WorkItemUpsertInput`.
 */
export function buildDetectedCatalogGapWorkItem(
  approval: AccountApprovalPayload,
): WorkItemUpsertInput {
  return {
    kind: 'catalog_gap_detected',
    entityType: 'product',
    entityId: approval.normalizedProductName,
    state: approvalStatusToWorkItemState(approval.status),
    title: `Criar produto ${approval.requestedProductName}`,
    summary: approval.operatorPrompt,
    priority: 95,
    utility: 95,
    requiresApproval: true,
    requiresInput: approval.status === 'APPROVED' && !!approval.inputSessionId,
    approvalState: approval.status,
    inputState: approval.inputSessionId ? 'OPEN' : null,
    blockedBy:
      approval.status === 'REJECTED'
        ? { reason: 'operator_rejected_product_creation', approvalId: approval.id }
        : null,
    evidence: {
      approvalId: approval.id,
      requestedProductName: approval.requestedProductName,
      contactId: approval.contactId,
      phone: approval.phone,
    },
    metadata: {
      source: approval.source,
      conversationId: approval.conversationId,
    },
  };
}

/**
 * Build the work-item upsert payload emitted when the operator approves an
 * existing catalog-gap approval (and we already have an input session).
 */
export function buildApprovedCatalogGapWorkItem(input: {
  approval: AccountApprovalPayload;
  approvalId: string;
  approvalStatus: AccountApprovalPayload['status'];
  inputSessionId: string;
  sessionStatus: string;
}): WorkItemUpsertInput {
  const { approval, approvalId, approvalStatus, inputSessionId, sessionStatus } = input;
  return {
    kind: 'catalog_gap_detected',
    entityType: 'product',
    entityId: approval.normalizedProductName,
    state: 'WAITING_INPUT',
    title: `Criar produto ${approval.requestedProductName}`,
    summary: approval.operatorPrompt,
    priority: 95,
    utility: 95,
    requiresApproval: true,
    requiresInput: true,
    approvalState: approvalStatus,
    inputState: sessionStatus,
    blockedBy: null,
    evidence: { approvalId, inputSessionId },
    metadata: {
      conversationId: approval.conversationId,
      contactId: approval.contactId,
      phone: approval.phone,
    },
  };
}

/**
 * Build the work-item upsert payload emitted when the operator rejects an
 * existing catalog-gap approval.
 */
export function buildRejectedCatalogGapWorkItem(
  approval: AccountApprovalPayload,
): WorkItemUpsertInput {
  return {
    kind: 'catalog_gap_detected',
    entityType: 'product',
    entityId: approval.normalizedProductName,
    state: 'BLOCKED',
    title: `Criar produto ${approval.requestedProductName}`,
    summary: approval.operatorPrompt,
    priority: 95,
    utility: 0,
    requiresApproval: true,
    requiresInput: false,
    approvalState: 'REJECTED',
    inputState: null,
    blockedBy: { reason: 'operator_rejected_product_creation', approvalId: approval.id },
    evidence: { approvalId: approval.id },
    metadata: {
      conversationId: approval.conversationId,
      contactId: approval.contactId,
      phone: approval.phone,
    },
  };
}

/** A minimal work-item shape used by `summarizeRuntime` for filtering. */
export interface RuntimeWorkItemShape {
  state?: string | null;
  updatedAt?: Date | string | null;
}

/**
 * Shape of an item produced by `summarizeRuntime`. Matches the runtime
 * response returned by `AccountAgentService.getRuntime`.
 */
export interface AccountAgentRuntimeSummary<W extends RuntimeWorkItemShape> {
  objective: 'revenue';
  mode: 'ACTIVE' | 'HUMAN_INPUT_REQUIRED';
  openApprovalCount: number;
  pendingInputCount: number;
  completedApprovalCount: number;
  openApprovals: AccountApprovalListItem[];
  pendingInputs: AccountInputSessionListItem[];
  workItems: W[];
  openWorkItemCount: number;
  noLegalActions: boolean;
  noLegalActionReasons: string[];
  capabilityRegistryVersion: typeof ACCOUNT_CAPABILITY_REGISTRY_VERSION;
  capabilityCount: number;
  conversationActionRegistryVersion: typeof CONVERSATION_ACTION_REGISTRY_VERSION;
  conversationActionCount: number;
  lastMeaningfulActionAt: string | Date | null;
}

/**
 * Build the runtime summary from already-loaded approvals/input-sessions/work-items.
 * Pure — no I/O, no logging.
 */
export function summarizeRuntime<W extends RuntimeWorkItemShape>(input: {
  approvals: AccountApprovalListItem[];
  inputSessions: AccountInputSessionListItem[];
  workItems: W[];
}): AccountAgentRuntimeSummary<W> {
  const { approvals, inputSessions, workItems } = input;
  const openApprovals = approvals.filter((a) => a.status === 'OPEN');
  const pendingInputs = inputSessions.filter((a) => a.status !== 'COMPLETED');
  const activeWorkItems = workItems.filter((w) =>
    ACTIVE_WORK_ITEM_STATES.includes(String(w.state || '')),
  );
  const noLegalActions =
    activeWorkItems.length === 0 && openApprovals.length === 0 && pendingInputs.length === 0;
  return {
    objective: 'revenue',
    mode: openApprovals.length > 0 || pendingInputs.length > 0 ? 'HUMAN_INPUT_REQUIRED' : 'ACTIVE',
    openApprovalCount: openApprovals.length,
    pendingInputCount: pendingInputs.length,
    completedApprovalCount: approvals.filter((a) => a.status === 'COMPLETED').length,
    openApprovals: openApprovals.slice(0, 10),
    pendingInputs: pendingInputs.slice(0, 10),
    workItems: workItems.slice(0, 20),
    openWorkItemCount: workItems.filter((w) => w.state !== 'COMPLETED').length,
    noLegalActions,
    noLegalActionReasons: noLegalActions ? ['account_universe_exhausted_for_current_registry'] : [],
    capabilityRegistryVersion: ACCOUNT_CAPABILITY_REGISTRY_VERSION,
    capabilityCount: ACCOUNT_CAPABILITY_REGISTRY.length,
    conversationActionRegistryVersion: CONVERSATION_ACTION_REGISTRY_VERSION,
    conversationActionCount: CONVERSATION_ACTION_REGISTRY.length,
    lastMeaningfulActionAt:
      approvals[0]?.lastDetectedAt ||
      pendingInputs[0]?.updatedAt ||
      workItems[0]?.updatedAt ||
      null,
  };
}

/** Build the KloelMemory key for an approval row. */
export function buildApprovalKey(normalizedProductName: string): string {
  return `account_approval:product_creation:${normalizedProductName}`;
}

/** Build the KloelMemory key for an input-collection-session row. */
export function buildInputSessionKey(normalizedProductName: string): string {
  return `account_input_session:product_creation:${normalizedProductName}`;
}

/**
 * Build the initial `AccountInputSessionPayload` row used by
 * `ensureInputSession` when no row exists yet for an approval.
 */
export function buildInitialInputSession(input: {
  approval: AccountApprovalPayload;
  newId: string;
  nowIso: string;
}): AccountInputSessionPayload {
  const { approval, newId, nowIso } = input;
  return {
    id: newId,
    approvalId: approval.id,
    kind: 'product_creation',
    status: 'WAITING_DESCRIPTION',
    productName: approval.requestedProductName,
    normalizedProductName: approval.normalizedProductName,
    contactId: approval.contactId,
    contactName: approval.contactName,
    phone: approval.phone,
    contactMessage: approval.contactMessage,
    answers: {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
