import { describe, expect, it } from "vitest";
import { planCiaActions } from "../processors/cia/brain";

describe("cia-brain", () => {
  it("prioritizes payment recovery and hot leads while respecting the action cap", () => {
    const state: any = {
      workspaceId: "ws-1",
      generatedAt: new Date().toISOString(),
      snapshot: {
        openBacklog: 18,
        hotLeadCount: 4,
        pendingPaymentCount: 2,
      },
      marketSignals: [],
      candidates: [
        {
          conversationId: "conv-payment",
          contactId: "contact-payment",
          phone: "5511999999991",
          contactName: "Pagamento",
          unreadCount: 0,
          lastMessageText: "me manda o pix novamente",
          priority: 99,
          cluster: "PAYMENT",
          suggestedAction: "PAYMENT_RECOVERY",
          demandState: { attentionScore: 1.1 },
        },
        {
          conversationId: "conv-hot",
          contactId: "contact-hot",
          phone: "5511999999992",
          contactName: "Quente",
          unreadCount: 2,
          lastMessageText: "quanto custa o PDRN?",
          priority: 97,
          cluster: "HOT",
          suggestedAction: "RESPOND",
          demandState: { attentionScore: 1.02 },
        },
        {
          conversationId: "conv-warm",
          contactId: "contact-warm",
          phone: "5511999999993",
          contactName: "Morno",
          unreadCount: 0,
          lastMessageText: "ainda estou pensando",
          priority: 72,
          cluster: "WARM",
          suggestedAction: "FOLLOWUP",
          demandState: { attentionScore: 0.7 },
        },
      ],
      clusters: {
        HOT: [],
        PAYMENT: [],
        WARM: [],
        COLD: [],
      },
    };

    state.clusters.PAYMENT = [state.candidates[0]];
    state.clusters.HOT = [state.candidates[1]];
    state.clusters.WARM = [state.candidates[2]];

    const batch = planCiaActions(state, { maxActionsPerCycle: 2 });

    expect(batch.actions).toHaveLength(2);
    expect(batch.actions.map((item) => item.type)).toContain("PAYMENT_RECOVERY");
    expect(batch.actions.map((item) => item.type)).toContain("RESPOND");
    expect(batch.summary).toContain("2 frentes");
  });

  it("uses global strategy hints to expand the cycle and prefer payment recovery", () => {
    const state: any = {
      workspaceId: "ws-1",
      generatedAt: new Date().toISOString(),
      snapshot: {
        openBacklog: 24,
        hotLeadCount: 2,
        pendingPaymentCount: 3,
      },
      marketSignals: [],
      candidates: [
        {
          conversationId: "conv-payment-1",
          contactId: "contact-payment-1",
          priority: 88,
          unreadCount: 0,
          lastMessageText: "manda o pix de novo",
          cluster: "PAYMENT",
          suggestedAction: "PAYMENT_RECOVERY",
          demandState: { attentionScore: 0.9 },
        },
        {
          conversationId: "conv-followup-1",
          contactId: "contact-followup-1",
          priority: 89,
          unreadCount: 0,
          lastMessageText: "depois eu vejo",
          cluster: "WARM",
          suggestedAction: "FOLLOWUP",
          demandState: { attentionScore: 0.7 },
        },
        {
          conversationId: "conv-followup-2",
          contactId: "contact-followup-2",
          priority: 74,
          unreadCount: 0,
          lastMessageText: "estou pensando",
          cluster: "COLD",
          suggestedAction: "FOLLOWUP",
          demandState: { attentionScore: 0.5 },
        },
      ],
      clusters: {
        HOT: [],
        PAYMENT: [],
        WARM: [],
        COLD: [],
      },
    };

    state.clusters.PAYMENT = [state.candidates[0]];
    state.clusters.WARM = [state.candidates[1]];
    state.clusters.COLD = [state.candidates[2]];

    const batch = planCiaActions(state, {
      maxActionsPerCycle: 2,
      strategy: {
        aggressiveness: "HIGH",
        preferredVariantFamily: "payment_recovery",
      },
    });

    expect(batch.actions).toHaveLength(3);
    expect(batch.actions[0]?.type).toBe("PAYMENT_RECOVERY");
  });
});
