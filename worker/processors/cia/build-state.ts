import {
  buildBusinessStateSnapshot,
  computeDemandState,
  extractMarketSignals,
  type BusinessStateSnapshot,
  type DemandState,
  type MarketSignal,
} from "../../providers/commercial-intelligence";

export type CiaActionType = "RESPOND" | "FOLLOWUP" | "PAYMENT_RECOVERY";
export type CiaCluster = "HOT" | "PAYMENT" | "WARM" | "COLD";

export interface CiaCandidate {
  conversationId: string;
  contactId?: string;
  phone?: string;
  contactName?: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  lastMessageText: string;
  priority: number;
  cluster: CiaCluster;
  suggestedAction: CiaActionType;
  demandState: DemandState;
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

const PAYMENT_HINTS = [
  "pix",
  "boleto",
  "cartao",
  "cartão",
  "pagamento",
  "pagar",
  "vencimento",
  "cobran",
];

function normalizeText(value?: string | null) {
  return String(value || "").toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function computePriority(input: {
  demandState: DemandState;
  unreadCount: number;
  lastMessageAt?: Date | string | null;
  isPayment: boolean;
}) {
  const recencyBoost = input.lastMessageAt
    ? Math.max(
        0,
        48 -
          (Date.now() - new Date(input.lastMessageAt).getTime()) / 3_600_000,
      ) * 0.6
    : 0;

  return Number(
    (
      input.demandState.attentionScore * 100 +
      input.unreadCount * 6 +
      recencyBoost +
      (input.isPayment ? 18 : 0) -
      input.demandState.fatigueScore * 14
    ).toFixed(3),
  );
}

export async function buildCiaWorkspaceState(
  prisma: any,
  workspaceId: string,
  options?: {
    limit?: number;
    silenceHours?: number;
  },
): Promise<CiaWorkspaceState> {
  const limit = Math.max(1, Math.min(500, Number(options?.limit || 120) || 120));
  const silenceHours = Math.max(
    1,
    Number(options?.silenceHours || 24) || 24,
  );
  const cutoff = new Date(Date.now() - silenceHours * 3_600_000);

  const [workspace, openBacklog, conversations, recentExecuted] =
    await Promise.all([
      prisma.workspace.findUnique?.({
        where: { id: workspaceId },
        select: { id: true, name: true },
      }),
      prisma.conversation.count
        ? prisma.conversation
            .count({
              where: {
                workspaceId,
                status: { not: "CLOSED" },
                unreadCount: { gt: 0 },
              },
            })
            .catch(() => 0)
        : Promise.resolve(0),
      prisma.conversation.findMany({
        where: {
          workspaceId,
          status: "OPEN",
          OR: [
            { unreadCount: { gt: 0 } },
            { lastMessageAt: { lt: cutoff } },
          ],
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
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: [{ lastMessageAt: "desc" }],
        take: limit,
      }),
      prisma.autopilotEvent?.findMany
        ? prisma.autopilotEvent
            .findMany({
              where: {
                workspaceId,
                status: "executed",
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
              },
              take: 50,
              orderBy: { createdAt: "desc" },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

  const candidates = conversations
    .map((conversation: any): CiaCandidate => {
      const lastInbound =
        conversation.messages.find((message: any) => message.direction === "INBOUND") ||
        conversation.messages[0];
      const lastMessageText = String(lastInbound?.content || "");
      const normalized = normalizeText(lastMessageText);
      const unreadCount = Number(conversation.unreadCount || 0) || 0;
      const demandState = computeDemandState({
        lastMessageAt: conversation.lastMessageAt,
        unreadCount,
        leadScore: conversation.contact?.leadScore || 0,
        lastMessageText,
      });

      const isPayment =
        demandState.strategy === "RECOVER_PAYMENT" ||
        includesAny(normalized, PAYMENT_HINTS);
      const suggestedAction: CiaActionType =
        unreadCount > 0
          ? "RESPOND"
          : isPayment
            ? "PAYMENT_RECOVERY"
            : "FOLLOWUP";

      const cluster: CiaCluster = isPayment
        ? "PAYMENT"
        : demandState.lane === "HOT"
          ? "HOT"
          : demandState.lane === "WARM"
            ? "WARM"
            : "COLD";

      return {
        conversationId: conversation.id,
        contactId: conversation.contact?.id,
        phone: conversation.contact?.phone,
        contactName: conversation.contact?.name,
        unreadCount,
        lastMessageAt: conversation.lastMessageAt?.toISOString?.() || null,
        lastMessageText,
        priority: computePriority({
          demandState,
          unreadCount,
          lastMessageAt: conversation.lastMessageAt,
          isPayment,
        }),
        cluster,
        suggestedAction,
        demandState,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  const marketSignals = extractMarketSignals(
    candidates.map((candidate) => candidate.lastMessageText),
  );
  const approvedSalesCount = recentExecuted.filter(
    (event: any) => event?.meta?.saleApproved === true,
  ).length;
  const approvedSalesAmount = recentExecuted
    .map((event: any) => Number(event?.meta?.amount || 0) || 0)
    .reduce((sum: number, amount: number) => sum + amount, 0);

  const snapshot = buildBusinessStateSnapshot({
    openBacklog,
    hotLeadCount: candidates.filter((item) => item.cluster === "HOT").length,
    pendingPaymentCount: candidates.filter((item) => item.cluster === "PAYMENT")
      .length,
    approvedSalesCount,
    approvedSalesAmount,
    avgResponseMinutes: 0,
    marketSignals,
  });

  return {
    workspaceId,
    workspaceName: workspace?.name || null,
    generatedAt: new Date().toISOString(),
    snapshot,
    marketSignals,
    candidates,
    clusters: {
      HOT: candidates.filter((item) => item.cluster === "HOT"),
      PAYMENT: candidates.filter((item) => item.cluster === "PAYMENT"),
      WARM: candidates.filter((item) => item.cluster === "WARM"),
      COLD: candidates.filter((item) => item.cluster === "COLD"),
    },
  };
}
