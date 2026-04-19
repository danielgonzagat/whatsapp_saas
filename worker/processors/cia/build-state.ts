import type { Prisma, PrismaClient } from '@prisma/client';

import {
  deriveOperationalUnreadCount,
  isConversationPendingForAgent,
  resolveConversationOwner,
} from '../../conversation-agent-state';
import {
  type BusinessStateSnapshot,
  type DemandState,
  type MarketSignal,
  buildBusinessStateSnapshot,
  computeDemandState,
  extractMarketSignals,
} from '../../providers/commercial-intelligence';
import {
  type CognitiveActionType,
  type CustomerCognitiveState,
  buildSeedCognitiveState,
} from './cognitive-state';

// Shape returned by the backlog scan query (lightweight select).
type BacklogConversation = Prisma.ConversationGetPayload<{
  select: {
    id: true;
    status: true;
    mode: true;
    assignedAgentId: true;
    unreadCount: true;
    lastMessageAt: true;
    messages: {
      select: {
        direction: true;
        createdAt: true;
      };
    };
  };
}>;

// Shape returned by the eligible-conversations query (full include of
// contact + messages).
type EligibleConversation = Prisma.ConversationGetPayload<{
  include: {
    contact: {
      select: {
        id: true;
        phone: true;
        name: true;
        leadScore: true;
        customFields: true;
        email: true;
      };
    };
    messages: true;
  };
}>;

type EligibleConversationMessage = EligibleConversation['messages'][number];

type AutopilotEventRow = Prisma.AutopilotEventGetPayload<true>;

// Contact.customFields is Prisma.JsonValue in the database. The seed
// consumer expects an object (or null); narrow defensively so non-object
// JSON values (arrays, scalars) degrade to an empty object.
function normalizeContactCustomFields(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// AutopilotEvent.meta is Prisma.JsonValue at rest. The processor writes
// a well-known shape via persistence helpers; we narrow defensively here
// so readers never trust untyped data.
function readAutopilotEventMeta(event: AutopilotEventRow): {
  saleApproved?: boolean;
  amount?: number;
} {
  const raw = event.meta;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, Prisma.JsonValue>;
    const saleApprovedRaw = record.saleApproved;
    const amountRaw = record.amount;
    return {
      saleApproved: typeof saleApprovedRaw === 'boolean' ? saleApprovedRaw : undefined,
      amount: typeof amountRaw === 'number' ? amountRaw : undefined,
    };
  }
  return {};
}

export type CiaActionType = CognitiveActionType;
export type CiaCluster = 'HOT' | 'PAYMENT' | 'WARM' | 'COLD';

export interface CiaCandidate {
  conversationId: string;
  contactId?: string;
  phone?: string;
  contactName?: string;
  unreadCount: number;
  pending: boolean;
  lastMessageAt?: string | null;
  lastMessageText: string;
  priority: number;
  cluster: CiaCluster;
  suggestedAction: CiaActionType;
  demandState: DemandState;
  silenceMinutes: number;
  cognitiveState: CustomerCognitiveState;
}

export interface CiaWorkspaceState {
  workspaceId: string;
  workspaceName?: string | null;
  generatedAt: string;
  snapshot: BusinessStateSnapshot;
  marketSignals: MarketSignal[];
  candidates: CiaCandidate[];
  clusters: Record<CiaCluster, CiaCandidate[]>;
}

export interface CiaSeedConversation {
  conversationId: string;
  contactId?: string;
  phone?: string;
  contactName?: string;
  unreadCount?: number;
  pending?: boolean;
  lastMessageAt?: Date | string | null;
  lastMessageText?: string | null;
  leadScore?: number | null;
  customFields?: Record<string, unknown> | null;
}

const PAYMENT_HINTS = [
  'pix',
  'boleto',
  'cartao',
  'cartão',
  'pagamento',
  'pagar',
  'vencimento',
  'cobran',
];

function normalizeText(value?: string | null) {
  return String(value || '').toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function computePriority(input: {
  demandState: DemandState;
  unreadCount: number;
  lastMessageAt?: Date | string | null;
  isPayment: boolean;
  cognitiveState: CustomerCognitiveState;
}) {
  const recencyBoost = input.lastMessageAt
    ? Math.max(0, 48 - (Date.now() - new Date(input.lastMessageAt).getTime()) / 3_600_000) * 0.6
    : 0;

  return Number(
    (
      input.demandState.attentionScore * 100 +
      input.unreadCount * 6 +
      recencyBoost +
      (input.isPayment ? 18 : 0) -
      input.demandState.fatigueScore * 14 +
      input.cognitiveState.trustScore * 12 +
      input.cognitiveState.urgencyScore * 14 +
      (input.cognitiveState.nextBestAction === 'OFFER' ? 10 : 0) +
      (input.cognitiveState.nextBestAction === 'PAYMENT_RECOVERY' ? 14 : 0) -
      input.cognitiveState.riskFlags.length * 8
    ).toFixed(3),
  );
}

function resolveCluster(
  isPayment: boolean,
  cognitiveState: { stage: string },
  demandState: { lane: string },
): CiaCluster {
  if (isPayment) return 'PAYMENT';
  if (cognitiveState.stage === 'HOT' || demandState.lane === 'HOT') return 'HOT';
  if (demandState.lane === 'WARM') return 'WARM';
  return 'COLD';
}

function computeSilenceMinutes(lastMessageAt: CiaSeedConversation['lastMessageAt']): number {
  if (!lastMessageAt) return 0;
  const elapsedMs = Date.now() - new Date(lastMessageAt).getTime();
  return Math.max(0, Math.round(elapsedMs / 60_000));
}

function normalizeLastMessageAt(
  lastMessageAt: CiaSeedConversation['lastMessageAt'],
): string | null {
  if (typeof lastMessageAt === 'string') return lastMessageAt;
  return lastMessageAt?.toISOString?.() || null;
}

function toCandidate(seed: CiaSeedConversation): CiaCandidate {
  const lastMessageText = String(seed.lastMessageText || '');
  const normalized = normalizeText(lastMessageText);
  const unreadCount = Number(seed.unreadCount || 0) || 0;
  const demandState = computeDemandState({
    lastMessageAt: seed.lastMessageAt,
    unreadCount,
    leadScore: seed.leadScore || 0,
    lastMessageText,
  });

  const isPayment =
    demandState.strategy === 'RECOVER_PAYMENT' || includesAny(normalized, PAYMENT_HINTS);
  const cognitiveState = buildSeedCognitiveState({
    conversationId: seed.conversationId,
    contactId: seed.contactId,
    phone: seed.phone,
    contactName: seed.contactName,
    lastMessageText,
    unreadCount,
    lastMessageAt: seed.lastMessageAt,
    leadScore: seed.leadScore || 0,
    demandState,
  });
  const suggestedAction: CiaActionType = cognitiveState.nextBestAction;

  return {
    conversationId: seed.conversationId,
    contactId: seed.contactId,
    phone: seed.phone,
    contactName: seed.contactName,
    unreadCount,
    pending: Boolean(seed.pending),
    lastMessageAt: normalizeLastMessageAt(seed.lastMessageAt),
    lastMessageText,
    priority: computePriority({
      demandState,
      unreadCount,
      lastMessageAt: seed.lastMessageAt,
      isPayment,
      cognitiveState,
    }),
    cluster: resolveCluster(isPayment, cognitiveState, demandState),
    suggestedAction,
    demandState,
    silenceMinutes: computeSilenceMinutes(seed.lastMessageAt),
    cognitiveState,
  };
}

export function buildCiaWorkspaceStateFromSeed(input: {
  workspaceId: string;
  workspaceName?: string | null;
  generatedAt?: string;
  openBacklog?: number;
  approvedSalesCount?: number;
  approvedSalesAmount?: number;
  conversations: CiaSeedConversation[];
}): CiaWorkspaceState {
  const candidates = input.conversations.map(toCandidate).sort((a, b) => b.priority - a.priority);

  const marketSignals = extractMarketSignals(
    candidates.map((candidate) => candidate.lastMessageText),
  );

  const snapshot = buildBusinessStateSnapshot({
    openBacklog: Number(input.openBacklog) || candidates.filter((item) => item.pending).length,
    hotLeadCount: candidates.filter((item) => item.cluster === 'HOT').length,
    pendingPaymentCount: candidates.filter((item) => item.cluster === 'PAYMENT').length,
    approvedSalesCount: Number(input.approvedSalesCount || 0) || 0,
    approvedSalesAmount: Number(input.approvedSalesAmount || 0) || 0,
    avgResponseMinutes: 0,
    marketSignals,
  });

  return {
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName || null,
    generatedAt: input.generatedAt || new Date().toISOString(),
    snapshot,
    marketSignals,
    candidates,
    clusters: {
      HOT: candidates.filter((item) => item.cluster === 'HOT'),
      PAYMENT: candidates.filter((item) => item.cluster === 'PAYMENT'),
      WARM: candidates.filter((item) => item.cluster === 'WARM'),
      COLD: candidates.filter((item) => item.cluster === 'COLD'),
    },
  };
}

export async function buildCiaWorkspaceState(
  prisma: PrismaClient,
  workspaceId: string,
  options?: {
    limit?: number;
    silenceHours?: number;
    allowProactive?: boolean;
  },
): Promise<CiaWorkspaceState> {
  const limit = Math.max(1, Math.min(500, Number(options?.limit || 120) || 120));
  const silenceHours = Math.max(1, Number(options?.silenceHours || 24) || 24);
  const allowProactive = options?.allowProactive === true;
  const cutoff = new Date(Date.now() - silenceHours * 3_600_000);
  const fetchLimit = Math.max(limit, Math.min(limit * 5, 1000));
  const backlogScanLimit = Math.max(fetchLimit, 1500);

  const [workspace, backlogConversations, conversations, recentExecuted] = await Promise.all([
    prisma.workspace.findUnique?.({
      where: { id: workspaceId },
      select: { id: true, name: true },
    }),
    prisma.conversation.findMany({
      where: {
        workspaceId,
        status: { not: 'CLOSED' },
      },
      select: {
        id: true,
        status: true,
        mode: true,
        assignedAgentId: true,
        unreadCount: true,
        lastMessageAt: true,
        messages: {
          select: {
            direction: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }],
      take: backlogScanLimit,
    }),
    prisma.conversation.findMany({
      where: {
        workspaceId,
        status: 'OPEN',
      },
      include: {
        contact: {
          select: {
            id: true,
            phone: true,
            name: true,
            leadScore: true,
            customFields: true,
            email: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }],
      take: fetchLimit,
    }),
    prisma.autopilotEvent?.findMany
      ? prisma.autopilotEvent
          .findMany({
            where: {
              workspaceId,
              status: 'executed',
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
              },
            },
            take: 50,
            orderBy: { createdAt: 'desc' },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const approvedSalesCount = recentExecuted.filter(
    (event: AutopilotEventRow) => readAutopilotEventMeta(event).saleApproved === true,
  ).length;
  const approvedSalesAmount = recentExecuted
    .map((event: AutopilotEventRow) => Number(readAutopilotEventMeta(event).amount || 0) || 0)
    .reduce((sum: number, amount: number) => sum + amount, 0);
  const openBacklog = backlogConversations.filter((conversation: BacklogConversation) =>
    isConversationPendingForAgent(conversation),
  ).length;
  const eligibleConversations = conversations
    .filter((conversation: EligibleConversation) => {
      if (resolveConversationOwner(conversation) !== 'AGENT') {
        return false;
      }

      if (isConversationPendingForAgent(conversation)) {
        return true;
      }

      if (!allowProactive) {
        return false;
      }

      if (!conversation.lastMessageAt) {
        return false;
      }

      return new Date(conversation.lastMessageAt).getTime() < cutoff.getTime();
    })
    .slice(0, limit);

  return buildCiaWorkspaceStateFromSeed({
    workspaceId,
    workspaceName: workspace?.name || null,
    openBacklog,
    approvedSalesCount,
    approvedSalesAmount,
    conversations: eligibleConversations.map((conversation: EligibleConversation) => {
      const lastInbound =
        conversation.messages.find(
          (message: EligibleConversationMessage) => message.direction === 'INBOUND',
        ) || conversation.messages[0];
      const pending = isConversationPendingForAgent(conversation);

      return {
        conversationId: conversation.id,
        contactId: conversation.contact?.id,
        phone: conversation.contact?.phone,
        contactName: conversation.contact?.name,
        unreadCount: deriveOperationalUnreadCount(conversation),
        pending,
        lastMessageAt: conversation.lastMessageAt,
        lastMessageText: lastInbound?.content || '',
        leadScore: conversation.contact?.leadScore || 0,
        customFields: normalizeContactCustomFields(conversation.contact?.customFields),
      };
    }),
  });
}
