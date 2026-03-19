import { describe, expect, it } from "vitest";
import { planCiaActions } from "../processors/cia/brain";
import {
  assertCiaGuarantees,
  buildCiaGuaranteeReport,
} from "../processors/cia/contracts";
import { buildSeedCognitiveState } from "../processors/cia/cognitive-state";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRandomState(seed: number, candidateCount: number) {
  const rand = mulberry32(seed);
  const candidates: any[] = [];
  const clusters = {
    HOT: [] as any[],
    PAYMENT: [] as any[],
    WARM: [] as any[],
    COLD: [] as any[],
  };

  for (let index = 0; index < candidateCount; index += 1) {
    const roll = rand();
    const cluster =
      roll < 0.2 ? "PAYMENT" : roll < 0.45 ? "HOT" : roll < 0.7 ? "WARM" : "COLD";
    const type =
      cluster === "PAYMENT"
        ? "PAYMENT_RECOVERY"
        : roll < 0.6
          ? "RESPOND"
          : "FOLLOWUP_SOFT";
    const lastMessageText =
      cluster === "PAYMENT"
        ? "me manda o pix novamente"
        : cluster === "HOT"
          ? "quanto custa isso?"
          : "ainda estou pensando";
    const candidate = {
      conversationId: `conv-${seed}-${index}`,
      contactId: `contact-${seed}-${index}`,
      phone: `55${seed}${index}`.slice(0, 13),
      contactName: `Contato ${index}`,
      unreadCount: Math.floor(rand() * 4),
      lastMessageText,
      priority: Number((rand() * 100 + (cluster === "PAYMENT" ? 50 : 0)).toFixed(3)),
      cluster,
      suggestedAction: type,
      demandState: {
        attentionScore: rand(),
      },
      silenceMinutes: Math.floor(rand() * 2000),
      cognitiveState: buildSeedCognitiveState({
        conversationId: `conv-${seed}-${index}`,
        contactId: `contact-${seed}-${index}`,
        phone: `55${seed}${index}`.slice(0, 13),
        lastMessageText,
        unreadCount: Math.floor(rand() * 4),
        lastMessageAt: new Date(Date.now() - Math.floor(rand() * 2000) * 60_000),
        leadScore: Math.floor(rand() * 100),
      }),
    };
    candidates.push(candidate);
    clusters[cluster as keyof typeof clusters].push(candidate);
  }

  return {
    workspaceId: `ws-${seed}`,
    generatedAt: new Date().toISOString(),
    snapshot: {
      openBacklog: candidateCount,
      hotLeadCount: clusters.HOT.length,
      pendingPaymentCount: clusters.PAYMENT.length,
    },
    marketSignals: [],
    candidates: candidates.sort((a, b) => b.priority - a.priority),
    clusters,
  };
}

describe("cia-contracts", () => {
  it("proves core invariants across many deterministic random cycles", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = buildRandomState(seed, 120);
      const batch = planCiaActions(state as any, { maxActionsPerCycle: 5 });
      const report = buildCiaGuaranteeReport(state as any, batch, 5);

      expect(() => assertCiaGuarantees(report)).not.toThrow();
      expect(report.guaranteed).toBe(true);
    }
  });

  it("keeps guarantees under scale with 1000 simulated contacts", () => {
    const state = buildRandomState(999, 1000);
    const batch = planCiaActions(state as any, { maxActionsPerCycle: 5 });
    const report = buildCiaGuaranteeReport(state as any, batch, 5);

    expect(report.details.candidateCount).toBe(1000);
    expect(report.details.selectedCount).toBeLessThanOrEqual(5);
    expect(report.guaranteed).toBe(true);
  });

  it("fails loudly when a malformed batch violates the contract", () => {
    const state = buildRandomState(7, 10);
    const batch = {
      actions: [
        {
          type: "RESPOND",
          cluster: "HOT",
          contactId: "dup",
          conversationId: "conv-1",
          priority: 1,
          reason: "x",
          lastMessageText: "x",
        },
        {
          type: "RESPOND",
          cluster: "HOT",
          contactId: "dup",
          conversationId: "conv-2",
          priority: 2,
          reason: "y",
          lastMessageText: "y",
        },
      ],
      ignoredCount: 0,
      summary: "",
    };

    const report = buildCiaGuaranteeReport(state as any, batch as any, 5);

    expect(report.guaranteed).toBe(false);
    expect(() => assertCiaGuarantees(report)).toThrow(
      /cia_contract_violation/,
    );
  });
});
