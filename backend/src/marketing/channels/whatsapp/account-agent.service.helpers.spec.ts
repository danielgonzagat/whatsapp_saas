import {
  ACTIVE_WORK_ITEM_STATES,
  approvalStatusToWorkItemState,
  buildApprovalKey,
  buildApprovedCatalogGapWorkItem,
  buildDetectedCatalogGapWorkItem,
  buildInitialInputSession,
  buildInputSessionKey,
  buildRejectedCatalogGapWorkItem,
  summarizeRuntime,
} from './account-agent.service.helpers';
import type {
  AccountApprovalListItem,
  AccountApprovalPayload,
  AccountInputSessionListItem,
} from './account-agent.types';

function makeApproval(overrides: Partial<AccountApprovalPayload> = {}): AccountApprovalPayload {
  return {
    id: 'appr_1',
    kind: 'product_creation',
    status: 'OPEN',
    requestedProductName: 'Mochila Esportiva',
    normalizedProductName: 'mochila-esportiva',
    contactId: 'contact_1',
    contactName: 'Maria',
    phone: '+5511999990000',
    conversationId: 'conv_1',
    contactMessage: 'Vocês têm mochilas esportivas?',
    operatorPrompt: 'Posso criar o produto Mochila Esportiva?',
    source: 'inbound_catalog_gap',
    firstDetectedAt: '2026-05-28T00:00:00.000Z',
    lastDetectedAt: '2026-05-28T00:00:00.000Z',
    ...overrides,
  };
}

function makeListApproval(
  overrides: Partial<AccountApprovalPayload> = {},
): AccountApprovalListItem {
  return {
    ...makeApproval(overrides),
    memoryId: 'mem_1',
    approvalRequestId: 'appr_req_1',
    canonical: true,
    respondedAt: null,
  };
}

function makeListSession(status: 'WAITING_DESCRIPTION' | 'COMPLETED'): AccountInputSessionListItem {
  return {
    id: 'sess_1',
    approvalId: 'appr_1',
    kind: 'product_creation',
    status,
    productName: 'Mochila Esportiva',
    normalizedProductName: 'mochila-esportiva',
    contactId: 'contact_1',
    contactName: 'Maria',
    phone: '+5511999990000',
    contactMessage: 'oi',
    answers: { description: null, offers: null, company: null },
    createdAt: '2026-05-28T00:00:00.000Z',
    updatedAt: '2026-05-28T00:00:01.000Z',
    memoryId: 'mem_2',
    inputCollectionSessionId: 'ics_2',
    canonical: true,
    currentPrompt: '...',
  };
}

describe('account-agent.service.helpers', () => {
  describe('approvalStatusToWorkItemState', () => {
    it('maps REJECTED → BLOCKED', () => {
      expect(approvalStatusToWorkItemState('REJECTED')).toBe('BLOCKED');
    });
    it('maps COMPLETED → COMPLETED', () => {
      expect(approvalStatusToWorkItemState('COMPLETED')).toBe('COMPLETED');
    });
    it('maps OPEN/APPROVED → WAITING_APPROVAL', () => {
      expect(approvalStatusToWorkItemState('OPEN')).toBe('WAITING_APPROVAL');
      expect(approvalStatusToWorkItemState('APPROVED')).toBe('WAITING_APPROVAL');
    });
  });

  describe('buildDetectedCatalogGapWorkItem', () => {
    it('builds a WAITING_APPROVAL work item for OPEN', () => {
      const wi = buildDetectedCatalogGapWorkItem(makeApproval());
      expect(wi.kind).toBe('catalog_gap_detected');
      expect(wi.entityType).toBe('product');
      expect(wi.state).toBe('WAITING_APPROVAL');
      expect(wi.requiresInput).toBe(false);
      expect(wi.inputState).toBeNull();
      expect(wi.blockedBy).toBeNull();
      expect(wi.evidence).toMatchObject({
        approvalId: 'appr_1',
        requestedProductName: 'Mochila Esportiva',
      });
      expect(wi.metadata).toMatchObject({
        source: 'inbound_catalog_gap',
        conversationId: 'conv_1',
      });
      expect(wi.title).toBe('Criar produto Mochila Esportiva');
    });

    it('emits requiresInput=true when APPROVED with inputSessionId', () => {
      const wi = buildDetectedCatalogGapWorkItem(
        makeApproval({ status: 'APPROVED', inputSessionId: 'sess_1' }),
      );
      expect(wi.state).toBe('WAITING_APPROVAL');
      expect(wi.requiresInput).toBe(true);
      expect(wi.inputState).toBe('OPEN');
    });

    it('emits BLOCKED + blockedBy for REJECTED', () => {
      const wi = buildDetectedCatalogGapWorkItem(makeApproval({ status: 'REJECTED' }));
      expect(wi.state).toBe('BLOCKED');
      expect(wi.blockedBy).toMatchObject({
        reason: 'operator_rejected_product_creation',
        approvalId: 'appr_1',
      });
    });

    it('emits state=COMPLETED for COMPLETED', () => {
      const wi = buildDetectedCatalogGapWorkItem(makeApproval({ status: 'COMPLETED' }));
      expect(wi.state).toBe('COMPLETED');
    });
  });

  describe('buildApprovedCatalogGapWorkItem', () => {
    it('emits WAITING_INPUT and threads ids into evidence', () => {
      const wi = buildApprovedCatalogGapWorkItem({
        approval: makeApproval({ status: 'APPROVED' }),
        approvalId: 'appr_1',
        approvalStatus: 'APPROVED',
        inputSessionId: 'sess_42',
        sessionStatus: 'WAITING_DESCRIPTION',
      });
      expect(wi.state).toBe('WAITING_INPUT');
      expect(wi.requiresInput).toBe(true);
      expect(wi.approvalState).toBe('APPROVED');
      expect(wi.inputState).toBe('WAITING_DESCRIPTION');
      expect(wi.evidence).toEqual({ approvalId: 'appr_1', inputSessionId: 'sess_42' });
      expect(wi.blockedBy).toBeNull();
    });
  });

  describe('buildRejectedCatalogGapWorkItem', () => {
    it('emits BLOCKED with utility=0 and reason', () => {
      const wi = buildRejectedCatalogGapWorkItem(makeApproval({ status: 'REJECTED' }));
      expect(wi.state).toBe('BLOCKED');
      expect(wi.utility).toBe(0);
      expect(wi.priority).toBe(95);
      expect(wi.requiresInput).toBe(false);
      expect(wi.inputState).toBeNull();
      expect(wi.approvalState).toBe('REJECTED');
      expect(wi.blockedBy).toEqual({
        reason: 'operator_rejected_product_creation',
        approvalId: 'appr_1',
      });
    });
  });

  describe('summarizeRuntime', () => {
    it('returns ACTIVE mode when no open approvals or pending inputs', () => {
      const summary = summarizeRuntime({
        approvals: [makeListApproval({ status: 'COMPLETED' })],
        inputSessions: [makeListSession('COMPLETED')],
        workItems: [],
      });
      expect(summary.mode).toBe('ACTIVE');
      expect(summary.openApprovalCount).toBe(0);
      expect(summary.pendingInputCount).toBe(0);
      expect(summary.completedApprovalCount).toBe(1);
      expect(summary.noLegalActions).toBe(true);
      expect(summary.noLegalActionReasons).toEqual([
        'account_universe_exhausted_for_current_registry',
      ]);
    });

    it('flips to HUMAN_INPUT_REQUIRED when an approval is OPEN', () => {
      const summary = summarizeRuntime({
        approvals: [makeListApproval({ status: 'OPEN' })],
        inputSessions: [],
        workItems: [],
      });
      expect(summary.mode).toBe('HUMAN_INPUT_REQUIRED');
      expect(summary.openApprovalCount).toBe(1);
      expect(summary.noLegalActions).toBe(false);
      expect(summary.noLegalActionReasons).toEqual([]);
    });

    it('counts active work items via the canonical state list', () => {
      const workItems = [
        { state: 'OPEN', updatedAt: '2026-05-01' },
        { state: 'COMPLETED', updatedAt: '2026-05-02' },
        { state: 'WAITING_APPROVAL', updatedAt: '2026-05-03' },
      ];
      const summary = summarizeRuntime({
        approvals: [],
        inputSessions: [],
        workItems,
      });
      expect(summary.openWorkItemCount).toBe(2); // not-COMPLETED
      expect(summary.noLegalActions).toBe(false); // active states present
    });

    it('caps slices to documented limits', () => {
      const manyApprovals = Array.from({ length: 25 }, (_, i) =>
        makeListApproval({ id: `appr_${i}`, status: 'OPEN' }),
      );
      const manyWorkItems = Array.from({ length: 30 }, (_, i) => ({
        state: 'OPEN',
        updatedAt: `${i}`,
      }));
      const summary = summarizeRuntime({
        approvals: manyApprovals,
        inputSessions: [],
        workItems: manyWorkItems,
      });
      expect(summary.openApprovals).toHaveLength(10);
      expect(summary.workItems).toHaveLength(20);
    });

    it('picks lastMeaningfulActionAt from approvals first', () => {
      const summary = summarizeRuntime({
        approvals: [makeListApproval({ lastDetectedAt: 'A' })],
        inputSessions: [makeListSession('WAITING_DESCRIPTION')],
        workItems: [{ state: 'OPEN', updatedAt: 'W' }],
      });
      expect(summary.lastMeaningfulActionAt).toBe('A');
    });

    it('falls back to pending input updatedAt when no approvals', () => {
      const summary = summarizeRuntime({
        approvals: [],
        inputSessions: [makeListSession('WAITING_DESCRIPTION')],
        workItems: [{ state: 'OPEN', updatedAt: 'W' }],
      });
      expect(summary.lastMeaningfulActionAt).toBe('2026-05-28T00:00:01.000Z');
    });
  });

  describe('ACTIVE_WORK_ITEM_STATES', () => {
    it('lists exactly the canonical active states', () => {
      expect([...ACTIVE_WORK_ITEM_STATES]).toEqual([
        'OPEN',
        'WAITING_APPROVAL',
        'WAITING_INPUT',
        'BLOCKED',
      ]);
    });
  });

  describe('key builders', () => {
    it('formats the approval key', () => {
      expect(buildApprovalKey('mochila-esportiva')).toBe(
        'account_approval:product_creation:mochila-esportiva',
      );
    });
    it('formats the input session key', () => {
      expect(buildInputSessionKey('mochila-esportiva')).toBe(
        'account_input_session:product_creation:mochila-esportiva',
      );
    });
  });

  describe('buildInitialInputSession', () => {
    it('seeds an empty session in WAITING_DESCRIPTION', () => {
      const session = buildInitialInputSession({
        approval: makeApproval({ status: 'APPROVED' }),
        newId: 'sess_new',
        nowIso: '2026-05-28T12:00:00.000Z',
      });
      expect(session.id).toBe('sess_new');
      expect(session.approvalId).toBe('appr_1');
      expect(session.status).toBe('WAITING_DESCRIPTION');
      expect(session.kind).toBe('product_creation');
      expect(session.answers).toEqual({});
      expect(session.createdAt).toBe('2026-05-28T12:00:00.000Z');
      expect(session.updatedAt).toBe('2026-05-28T12:00:00.000Z');
      expect(session.productName).toBe('Mochila Esportiva');
      expect(session.normalizedProductName).toBe('mochila-esportiva');
      expect(session.contactMessage).toBe('Vocês têm mochilas esportivas?');
    });
  });
});
