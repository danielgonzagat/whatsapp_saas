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

  const cluster: CiaCluster = isPayment
    ? 'PAYMENT'
    : cognitiveState.stage === 'HOT' || demandState.lane === 'HOT'
      ? 'HOT'
      : demandState.lane === 'WARM'
        ? 'WARM'
        : 'COLD';
  const silenceMinutes = seed.lastMessageAt
    ? Math.max(0, Math.round((Date.now() - new Date(seed.lastMessageAt).getTime()) / 60_000))
    : 0;

  return {
    conversationId: seed.conversationId,
    contactId: seed.contactId,
    phone: seed.phone,
    contactName: seed.contactName,
    unreadCount,
    pending: Boolean(seed.pending),
    lastMessageAt:
      (typeof seed.lastMessageAt === 'string'
        ? seed.lastMessageAt
        : seed.lastMessageAt?.toISOString?.()) || null,
    lastMessageText,
    priority: computePriority({
      demandState,
      unreadCount,
      lastMessageAt: seed.lastMessageAt,
      isPayment,
      cognitiveState,
    }),
    cluster,
    suggestedAction,
    demandState,
    silenceMinutes,
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
  prisma: any,
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
    (event: any) => event?.meta?.saleApproved === true,
  ).length;
  const approvedSalesAmount = recentExecuted
    .map((event: any) => Number(event?.meta?.amount || 0) || 0)
    .reduce((sum: number, amount: number) => sum + amount, 0);
  const openBacklog = backlogConversations.filter((conversation: any) =>
    isConversationPendingForAgent(conversation),
  ).length;
  const eligibleConversations = conversations
    .filter((conversation: any) => {
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
    conversations: eligibleConversations.map((conversation: any) => {
      const lastInbound =
        conversation.messages.find((message: any) => message.direction === 'INBOUND') ||
        conversation.messages[0];
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
        customFields: conversation.contact?.customFields || {},
      };
    }),
  });
}
