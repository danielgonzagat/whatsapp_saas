// Cia proof + conversation proof type definitions. Extracted from
// cia.types.ts as part of the gate-fix-D split (keep each file <= 400 LOC).
// The barrel `cia.types.ts` re-exports every symbol below so existing
// consumers continue to compile without modification.

/** Cia proof shape. */
export interface CiaProof {
  /** Id property. */
  id: string;
  /** Key property. */
  key?: string;
  /** Type property. */
  type?: string;
  /** Summary property. */
  summary?: string | null;
  /** Cycle proof id property. */
  cycleProofId?: string | null;
  /** Generated at property. */
  generatedAt: string;
  /** Guarantee report property. */
  guaranteeReport?: string | Record<string, unknown> | null;
  /** Exhaustion report property. */
  exhaustionReport?: string | Record<string, unknown> | null;
  /** Proof type property. */
  proofType?: string;
  /** Status property. */
  status?: string;
  /** No legal actions property. */
  noLegalActions?: boolean;
  /** Candidate count property. */
  candidateCount?: number;
  /** Eligible action count property. */
  eligibleActionCount?: number;
  /** Blocked action count property. */
  blockedActionCount?: number;
  /** Deferred action count property. */
  deferredActionCount?: number;
  /** Waiting approval count property. */
  waitingApprovalCount?: number;
  /** Waiting input count property. */
  waitingInputCount?: number;
  /** Silent remainder count property. */
  silentRemainderCount?: number;
  /** Work item universe property. */
  workItemUniverse?: Record<string, unknown>[];
  /** Action universe property. */
  actionUniverse?: Record<string, unknown>[];
  /** Executed actions property. */
  executedActions?: Record<string, unknown>[];
  /** Blocked actions property. */
  blockedActions?: Record<string, unknown>[];
  /** Deferred actions property. */
  deferredActions?: Record<string, unknown>[];
  /** Canonical property. */
  canonical?: boolean;
}

/** Cia conversation proof shape. */
export interface CiaConversationProof {
  /** Id property. */
  id: string;
  /** Canonical property. */
  canonical: boolean;
  /** Conversation id property. */
  conversationId: string;
  /** Contact id property. */
  contactId: string | null;
  /** Phone property. */
  phone: string | null;
  /** Status property. */
  status: string;
  /** Cycle proof id property. */
  cycleProofId: string | null;
  /** Account proof id property. */
  accountProofId: string | null;
  /** Selected action type property. */
  selectedActionType: string;
  /** Selected tactic property. */
  selectedTactic: string | null;
  /** Governor property. */
  governor: string | null;
  /** Rendered message property. */
  renderedMessage: string | null;
  /** Outcome property. */
  outcome: string | null;
  /** Action universe property. */
  actionUniverse: Record<string, unknown>[];
  /** Tactic universe property. */
  tacticUniverse: Record<string, unknown>[];
  /** Selected action property. */
  selectedAction: Record<string, unknown> | null;
  /** Selected tactic data property. */
  selectedTacticData: Record<string, unknown> | null;
  /** Metadata property. */
  metadata: Record<string, unknown> | null;
  /** Generated at property. */
  generatedAt: string;
}
