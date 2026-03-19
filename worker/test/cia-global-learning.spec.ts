import { describe, expect, it } from "vitest";
import {
  anonymizeDecisionLog,
  buildGlobalStrategy,
  computeGlobalPatterns,
  inferWorkspaceDomain,
} from "../processors/cia/global-learning";

describe("cia-global-learning", () => {
  it("anonymizes local decision logs without leaking raw message or phone", () => {
    const signal = anonymizeDecisionLog({
      domain: "supplement",
      log: {
        createdAt: "2026-03-19T10:00:00.000Z",
        value: {
          intent: "BUYING",
          variantKey: "followup:proof",
          message: "Consigo fechar o PDRN no PIX por R$397 agora",
          outcome: "SOLD",
          priority: 88,
          metadata: {
            revenue: 397,
            phone: "5511999999999",
          },
        },
        metadata: {
          phone: "5511999999999",
        },
      },
    });

    expect(signal).toEqual(
      expect.objectContaining({
        domain: "supplement",
        intent: "buying",
        outcome: "sold",
        hasPriceMention: true,
        priorityBucket: "high",
        revenue: 397,
      }),
    );
    expect(signal).not.toHaveProperty("message");
    expect(signal).not.toHaveProperty("phone");
  });

  it("computes aggregate patterns and derives a reusable global strategy", () => {
    const patterns = computeGlobalPatterns([
      {
        domain: "supplement",
        intent: "buying",
        outcome: "sold",
        hour: 10,
        messageLength: 72,
        lengthBucket: "short",
        hasPriceMention: true,
        variantFamily: "followup",
        priorityBucket: "high",
        revenue: 397,
      },
      {
        domain: "supplement",
        intent: "buying",
        outcome: "replied",
        hour: 10,
        messageLength: 80,
        lengthBucket: "short",
        hasPriceMention: true,
        variantFamily: "followup",
        priorityBucket: "high",
        revenue: 0,
      },
      {
        domain: "supplement",
        intent: "buying",
        outcome: "sold",
        hour: 11,
        messageLength: 140,
        lengthBucket: "medium",
        hasPriceMention: true,
        variantFamily: "followup",
        priorityBucket: "medium",
        revenue: 697,
      },
      {
        domain: "supplement",
        intent: "payment_recovery",
        outcome: "sold",
        hour: 9,
        messageLength: 115,
        lengthBucket: "medium",
        hasPriceMention: true,
        variantFamily: "payment_recovery",
        priorityBucket: "high",
        revenue: 197,
      },
    ]);

    const strategy = buildGlobalStrategy({
      patterns,
      domain: "supplement",
      intent: "buying",
    });

    expect(patterns[0]).toEqual(
      expect.objectContaining({
        domain: "supplement",
        intent: "buying",
        samples: 3,
        aggressiveness: "HIGH",
      }),
    );
    expect(strategy).toEqual(
      expect.objectContaining({
        domain: "supplement",
        preferredLength: expect.stringMatching(/short|medium/),
        aggressiveness: "HIGH",
        confidence: expect.any(Number),
      }),
    );
  });

  it("infers workspace domain from business settings", () => {
    expect(
      inferWorkspaceDomain({
        businessInfo: {
          segment: "Suplementos",
        },
      }),
    ).toBe("suplementos");
    expect(inferWorkspaceDomain({})).toBe("generic");
  });
});
