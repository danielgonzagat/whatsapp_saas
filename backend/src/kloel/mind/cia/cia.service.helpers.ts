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

type LatestAgentEvent = {
  message: string;
  phase?: string | null;
  type: string;
  ts: number | string | Date;
} | null;

/**
 * Project the most recent agent event into the public `now` surface slot. Pure
 * — does not query agent-events; receives the event directly.
 */
export function buildNowEvent(latest: LatestAgentEvent) {
  if (!latest) {
    return null;
  }
  return {
    message: latest.message,
    phase: latest.phase || null,
    type: latest.type,
    ts: latest.ts,
  };
}

type HumanTaskRecord = {
  id: string;
  workspaceId: string;
  category: string | null;
  key: string;
  value: unknown;
  createdAt: Date;
};

/**
 * Project a single kloelMemory `human_task` row into the public surface DTO,
 * preserving malformed payloads as empty objects so the spread never explodes
 * a string into char-indexed keys.
 */
export function mapHumanTaskListItem(item: HumanTaskRecord) {
  const task = readRecord(item.value);
  return {
    memoryId: item.id,
    key: item.key,
    ...task,
    status: readText(task.status) || 'OPEN',
  };
}

/** Predicate: only OPEN / non-resolved / non-rejected tasks survive. */
export function isActiveHumanTask(task: { status: string }): boolean {
  return task.status !== 'REJECTED' && task.status !== 'RESOLVED';
}

/** Build the next `value` JSON for an approved human task (status=RESOLVED). */
export function buildResolvedHumanTaskValue(
  task: JsonRecord,
  approvedReply: string,
  resolvedAt: string,
): JsonRecord {
  return {
    ...task,
    status: 'RESOLVED',
    resolvedAt,
    approvedReply: approvedReply || null,
  };
}

/** Build the next `value` JSON for a rejected human task (status=REJECTED). */
export function buildRejectedHumanTaskValue(
  task: JsonRecord,
  resolvedAt: string,
): JsonRecord {
  return {
    ...task,
    status: 'REJECTED',
    resolvedAt,
  };
}

/**
 * Merge the prior metadata record with the new resolution status — used by
 * both `approveHumanTask` and `rejectHumanTask` to normalize malformed
 * metadata (string/null/array → {}) before persisting.
 */
export function buildHumanTaskMetadataUpdate(
  priorMetadata: unknown,
  status: 'RESOLVED' | 'REJECTED',
  resolvedAt: string,
): JsonRecord {
  return {
    ...readRecord(priorMetadata),
    status,
    resolvedAt,
  };
}

/** Build the Portuguese status-line message for an approved human task. */
export function buildHumanTaskApprovalMessage(
  approvedReply: string,
  taskPhone: string,
  taskConversationId: string,
): string {
  if (approvedReply) {
    return `Validação concluída. Enviei a resposta aprovada para ${taskPhone || 'o contato'}.`;
  }
  return `Validação concluída. Retomei a autonomia da conversa ${taskConversationId}.`;
}

/** Build the Portuguese status-line message for a rejected human task. */
export function buildHumanTaskRejectionMessage(taskPhone: string): string {
  return `Exceção humana dispensada para ${taskPhone || 'o contato'}.`;
}

type HumanTaskCandidate = {
  id: string;
  key: string;
  value: unknown;
  category?: string | null;
  type?: string | null;
  content?: string | null;
  metadata?: unknown;
  createdAt: Date;
};

/**
 * Predicate: match a `kloelMemory` row whose decoded `value.id` equals the
 * caller-supplied taskId. Used by {@link CiaService.findHumanTask}.
 */
export function matchHumanTaskCandidate(
  item: HumanTaskCandidate,
  taskId: string,
): boolean {
  const value = readRecord(item.value);
  return readText(value.id) === taskId;
}
