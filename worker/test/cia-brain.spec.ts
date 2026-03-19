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
});
