/**
 * ARCHITECTURAL COHESION: This file builds the CIA Workspace State — the
 * input data structure consumed by the autopilot brain. It queries
 * Prisma for conversations, contacts, and autopilot events, then assembles
 * them into a CiaWorkspaceState with candidates clustered by priority.
 * The candidate scoring/building logic (toCandidate, computePriority) is
 * extracted to cia-candidate-builder.ts. What remains is the database
 * query orchestration and the high-level state assembly that ties the
 * queries to the scoring pipeline.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import {
  deriveOperationalUnreadCount,
  isConversationPendingForAgent,
  resolveConversationOwner,
} from '../../conversation-agent-state';
import {
  type BusinessStateSnapshot,
  type MarketSignal,
  buildBusinessStateSnapshot,
  extractMarketSignals,
} from '../../providers/commercial-intelligence';
import { toCandidate } from './cia-candidate-builder';
import type { CiaCandidate, CiaCluster } from './cia-candidate-builder';

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
  saleApproved: boolean | undefined;
  amount: number | undefined;
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
  return { saleApproved: undefined, amount: undefined };
}

export type { CiaActionType, CiaCandidate, CiaCluster } from './cia-candidate-builder';

/** Cia workspace state shape. */
export interface CiaWorkspaceState {
  /** Workspace id property. */
  workspaceId: string;
  /** Workspace name property. */
  workspaceName?: string | null;
  /** Generated at property. */
  generatedAt: string;
  /** Snapshot property. */
  snapshot: BusinessStateSnapshot;
  /** Market signals property. */
  marketSignals: MarketSignal[];
  /** Candidates property. */
  candidates: CiaCandidate[];
  /** Clusters property. */
  clusters: Record<CiaCluster, CiaCandidate[]>;
}

/** Cia seed conversation shape. */
export interface CiaSeedConversation {
  /** Conversation id property. */
  conversationId: string;
  /** Contact id property. */
  contactId?: string | undefined;
  /** Phone property. */
  phone?: string | undefined;
  /** Contact name property. */
  contactName?: string | undefined;
  /** Unread count property. */
  unreadCount?: number | undefined;
  /** Pending property. */
  pending?: boolean | undefined;
  /** Last message at property. */
  lastMessageAt?: Date | string | null | undefined;
  /** Last message text property. */
  lastMessageText?: string | null | undefined;
  /** Lead score property. */
  leadScore?: number | null | undefined;
  /** Custom fields property. */
  customFields?: Record<string, unknown> | null | undefined;
}

/** Build cia workspace state from seed. */
export function buildCiaWorkspaceStateFromSeed(input: {
  workspaceId: string;
  workspaceName?: string | null | undefined;
  generatedAt?: string | undefined;
  openBacklog?: number | undefined;
  approvedSalesCount?: number | undefined;
  approvedSalesAmount?: number | undefined;
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

/** Build cia workspace state. */
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
        contactName: conversation.contact?.name ?? undefined,
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
