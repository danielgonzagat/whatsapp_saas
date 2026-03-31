import { describe, expect, it } from "vitest";
import {
  buildBusinessStateSnapshot,
  buildDecisionEnvelope,
  buildHumanTask,
  buildMissionPlan,
  computeDemandState,
  extractMarketSignals,
  shouldAutonomousSend,
} from "../providers/commercial-intelligence";

describe("commercial-intelligence", () => {
  it("computes hot demand state for recent buying conversations", () => {
    const state = computeDemandState({
      lastMessageAt: new Date(Date.now() - 30 * 60 * 1000),
      unreadCount: 3,
      leadScore: 88,
      lastMessageText: "quero comprar o serum no pix hoje",
    });

    expect(state.lane).toBe("HOT");
    expect(state.strategy).toBe("RECOVER_PAYMENT");
    expect(state.attentionScore).toBeGreaterThan(0.7);
  });

  it("blocks autonomous sending when risk flags are critical", () => {
    const demandState = computeDemandState({
      lastMessageAt: new Date(),
      unreadCount: 1,
      leadScore: 55,
      lastMessageText: "vou abrir processo no procon e quero reembolso",
    });
    const envelope = buildDecisionEnvelope({
      intent: "SUPPORT",
      action: "TRANSFER_AGENT",
      confidence: 0.82,
      messageContent: "vou abrir processo no procon e quero reembolso",
      demandState,
    });

    expect(envelope.riskFlags).toContain("LEGAL_RISK");
    expect(envelope.shouldEscalate).toBe(true);
    expect(shouldAutonomousSend(envelope, "AUTONOMOUS")).toBe(false);
  });

  it("extracts dominant market signals and builds a business snapshot", () => {
    const signals = extractMarketSignals([
      "quanto custa o produto",
      "tem kit de 3 unidades?",
      "quero parcelar no cartao",
      "o rastreio saiu?",
      "quanto custa o produto no pix",
    ]);
    const snapshot = buildBusinessStateSnapshot({
      openBacklog: 120,
      hotLeadCount: 18,
      pendingPaymentCount: 12,
      approvedSalesCount: 7,
      approvedSalesAmount: 2890,
      avgResponseMinutes: 3.5,
      marketSignals: signals,
    });

    expect(signals.map((signal) => signal.normalizedKey)).toContain("price_resistance");
    expect(snapshot.growthRiskLevel).toBe("MEDIUM");
    expect(snapshot.topProductKey).toContain("product:");
  });

  it("builds a human task and a mission plan when autonomy needs supervision", () => {
    const demandState = computeDemandState({
      lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      unreadCount: 1,
      leadScore: 74,
      lastMessageText: "consigo esse desconto de 30%?",
    });
    const envelope = buildDecisionEnvelope({
      intent: "BUYING",
      action: "SEND_PRICE",
      confidence: 0.61,
      messageContent: "consigo esse desconto de 30%?",
      demandState,
    });
    const task = buildHumanTask({
      workspaceId: "ws-1",
      contactId: "contact-1",
      phone: "5511999999999",
      decision: envelope,
      messageContent: "consigo esse desconto de 30%?",
    });
    const missionPlan = buildMissionPlan({
      demandStates: [
        { contactName: "Luiz", demandState },
        {
          contactName: "Marcos",
          demandState: computeDemandState({
            lastMessageAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
            unreadCount: 2,
            leadScore: 66,
            lastMessageText: "queria saber o preço do produto premium",
          }),
        },
      ],
      marketSignals: extractMarketSignals([
        "consigo esse desconto de 30%?",
        "queria saber o preço do produto premium",
      ]),
      snapshot: buildBusinessStateSnapshot({
        openBacklog: 42,
        hotLeadCount: 7,
        pendingPaymentCount: 3,
        approvedSalesCount: 4,
        approvedSalesAmount: 1490,
        avgResponseMinutes: 2.1,
        marketSignals: extractMarketSignals([
          "consigo esse desconto de 30%?",
          "queria saber o preço do produto premium",
        ]),
      }),
    });

    expect(task).not.toBeNull();
    expect(task?.reason).toContain("risco operacional");
    expect(missionPlan.summary).toContain("priorizar");
    expect(missionPlan.focusContacts.length).toBeGreaterThan(0);
  });
});
