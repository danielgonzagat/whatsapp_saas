/**
 * Pure helper functions extracted from {@link ./cia.service.ts}.
 *
 * These helpers MUST stay pure (no Nest DI, no Prisma calls, no I/O). They
 * exist to keep `cia.service.ts` under the ≤520 LOC budget defined by the
 * WAVE roadmap (`docs/architecture/WAVE_73_NEXT_10_WAVES.md` — Wave 82
 * carve-out handle).
 *
 * @cluster Mind/CIA
 * @see ./cia.service.ts
 */

export type JsonRecord = Record<string, unknown>;

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

/** Pure JSON-record coercion: any non-object/array value collapses to {}. */
export function readRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

/** Pure string coercion: only real strings survive; everything else becomes ''. */
export function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Collect the set of connected channels for a workspace from the Meta
 * connection rows + the active integration rows. Pure: input → output.
 */
export function collectActiveChannels(
  metaConnections: Array<{
    whatsappPhoneNumberId?: string | null;
    instagramAccountId?: string | null;
    pageId?: string | null;
  }> | null,
  integrations: Array<{ type: string }>,
): string[] {
  const active = new Set<string>();
  if (metaConnections && metaConnections.length > 0) {
    for (const mc of metaConnections) {
      if (mc.whatsappPhoneNumberId) {
        active.add('whatsapp');
      }
      if (mc.instagramAccountId) {
        active.add('instagram');
      }
      if (mc.pageId) {
        active.add('facebook');
      }
    }
  }
  for (const integration of integrations) {
    if (integration.type.toLowerCase() === 'instagram') {
      active.add('instagram');
    }
  }
  return [...active];
}

/** Build the workspace subtitle from the resolved active-channels list. */
export function buildChannelSubtitle(channels: string[]): string {
  if (channels.length === 0) {
    return 'Cuidando do seu negócio';
  }
  if (channels.length === 1) {
    const [channel] = channels;
    const label = channel ? CHANNEL_LABEL[channel] || channel : 'canal conectado';
    return `Cuidando do seu negócio no ${label}`;
  }
  return 'Orquestrando seus canais de venda';
}

type MindLiftInput =
  | {
      n: number;
      mindMean: number;
      baselineMean: number;
      lift: number;
      pZScore: number;
    }
  | null
  | undefined;

/** Project a MIND lift result into the CIA surface contract. */
export function mapMindLift(mindLift: MindLiftInput) {
  if (!mindLift) {
    return null;
  }
  return {
    decisionType: 'followup_timing' as const,
    n: mindLift.n,
    mindMean: mindLift.mindMean,
    baselineMean: mindLift.baselineMean,
    lift: mindLift.lift,
    pZScore: mindLift.pZScore,
  };
}

type AccountProofRecord = {
  id: string;
  proofType: string;
  status: string;
  cycleProofId: string | null;
  noLegalActions: boolean | null;
  candidateCount: number | null;
  eligibleActionCount: number | null;
  blockedActionCount: number | null;
  deferredActionCount: number | null;
  waitingApprovalCount: number | null;
  waitingInputCount: number | null;
  silentRemainderCount: number | null;
  workItemUniverse: unknown;
  actionUniverse: unknown;
  executedActions: unknown;
  blockedActions: unknown;
  deferredActions: unknown;
  metadata: unknown;
  createdAt: Date;
};

/** Project an AccountProofSnapshot row into the public surface DTO. */
export function mapAccountProofRecord(record: AccountProofRecord) {
  const metadata = readRecord(record.metadata);
  return {
    id: record.id,
    canonical: true,
    proofType: record.proofType,
    status: record.status,
    cycleProofId: record.cycleProofId || null,
    noLegalActions: Boolean(record.noLegalActions),
    candidateCount: Number(record.candidateCount || 0),
    eligibleActionCount: Number(record.eligibleActionCount || 0),
    blockedActionCount: Number(record.blockedActionCount || 0),
    deferredActionCount: Number(record.deferredActionCount || 0),
    waitingApprovalCount: Number(record.waitingApprovalCount || 0),
    waitingInputCount: Number(record.waitingInputCount || 0),
    silentRemainderCount: Number(record.silentRemainderCount || 0),
    workItemUniverse: record.workItemUniverse || [],
    actionUniverse: record.actionUniverse || [],
    executedActions: record.executedActions || [],
    blockedActions: record.blockedActions || [],
    deferredActions: record.deferredActions || [],
    summary: metadata.summary || null,
    guaranteeReport: metadata.guaranteeReport || null,
    exhaustionReport: metadata.exhaustionReport || null,
    generatedAt: record.createdAt,
  };
}

type ConversationProofRecord = {
  id: string;
  conversationId: string;
  contactId: string | null;
  phone: string | null;
  status: string;
  cycleProofId: string | null;
  accountProofId: string | null;
  selectedActionType: string;
  selectedTactic: string | null;
  governor: unknown;
  renderedMessage: string | null;
  outcome: unknown;
  actionUniverse: unknown;
  tacticUniverse: unknown;
  selectedAction: unknown;
  selectedTacticData: unknown;
  metadata: unknown;
  createdAt: Date;
};

/** Project a ConversationProofSnapshot row into the public surface DTO. */
export function mapConversationProofRecord(record: ConversationProofRecord) {
  return {
    id: record.id,
    canonical: true,
    conversationId: record.conversationId,
    contactId: record.contactId || null,
    phone: record.phone || null,
    status: record.status,
    cycleProofId: record.cycleProofId || null,
    accountProofId: record.accountProofId || null,
    selectedActionType: record.selectedActionType,
    selectedTactic: record.selectedTactic || null,
    governor: record.governor || null,
    renderedMessage: record.renderedMessage || null,
    outcome: record.outcome || null,
    actionUniverse: record.actionUniverse || [],
    tacticUniverse: record.tacticUniverse || [],
    selectedAction: record.selectedAction || null,
    selectedTacticData: record.selectedTacticData || null,
    metadata: record.metadata || null,
    generatedAt: record.createdAt,
  };
}

type CycleProofRecord = {
  id: string;
  key: string;
  type: string | null;
  value: unknown;
  metadata: unknown;
  content: string | null;
  createdAt: Date;
};

/** Project a kloelMemory cycle-proof row into the public surface DTO. */
export function mapCycleProofRecord(record: CycleProofRecord) {
  const value = readRecord(record.value);
  const metadata = readRecord(record.metadata);
  return {
    id: record.id,
    key: record.key,
    type: record.type,
    summary: value.summary || record.content || null,
    cycleProofId: value.cycleProofId || metadata.cycleProofId || null,
    generatedAt: value.generatedAt || record.createdAt,
    guaranteeReport: value.guaranteeReport || null,
    exhaustionReport: value.exhaustionReport || null,
  };
}

type CognitiveHighlightItem = {
  id: string;
  key: string;
  value: unknown;
  category: string;
  type: string | null;
  content: string | null;
  metadata: unknown;
  createdAt: Date;
};

/** Project a kloelMemory cognitive-highlight row into the surface DTO. */
export function serializeCognitiveHighlight(item: CognitiveHighlightItem) {
  const value = readRecord(item.value);
  const metadata = readRecord(item.metadata);
  return {
    id: item.id,
    category: item.category,
    type: item.type,
    contactId: value.contactId || metadata.contactId || null,
    conversationId: value.conversationId || metadata.conversationId || null,
    phone: value.phone || metadata.phone || null,
    summary: value.summary || value.message || item.content || 'Sinal cognitivo disponível.',
    nextBestAction: value.nextBestAction || value.action || null,
    intent: value.intent || null,
    stage: value.stage || null,
    outcome: value.outcome || null,
    confidence: value.classificationConfidence || null,
    updatedAt: value.updatedAt || item.createdAt,
  };
}
