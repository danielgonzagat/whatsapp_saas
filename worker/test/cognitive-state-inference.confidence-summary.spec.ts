import { describe, expect, it } from 'vitest';

import {
  inferConfidence,
  summarizeState,
} from '../processors/cia/cognitive-state/cognitive-state-inference';

describe('inferConfidence', () => {
  it('raises confidence for BUYING intent', () => {
    const value = inferConfidence({
      intent: 'BUYING',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    expect(value).toBeGreaterThan(0.7);
  });

  it('raises confidence for PAYMENT intent', () => {
    const value = inferConfidence({
      intent: 'PAYMENT',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    expect(value).toBeGreaterThan(0.7);
  });

  it('lowers confidence for SUPPORT intent', () => {
    const value = inferConfidence({
      intent: 'SUPPORT',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    expect(value).toBeLessThan(0.58);
  });

  it('raises confidence slightly when objections are present', () => {
    const baseline = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    const withObjections = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: ['price'],
      unreadCount: 0,
    });
    expect(withObjections).toBeGreaterThan(baseline);
  });

  it('lowers confidence when risk flags are present', () => {
    const baseline = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: [],
      unreadCount: 0,
    });
    const withRisks = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: ['LEGAL_RISK'],
      objections: [],
      unreadCount: 0,
    });
    expect(withRisks).toBeLessThan(baseline);
  });

  it('raises confidence when there are multiple unread messages', () => {
    const baseline = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: [],
      unreadCount: 1,
    });
    const burst = inferConfidence({
      intent: 'UNKNOWN',
      riskFlags: [],
      objections: [],
      unreadCount: 5,
    });
    expect(burst).toBeGreaterThan(baseline);
  });

  it('clamps confidence to the [0.1, 0.98] range', () => {
    const veryLow = inferConfidence({
      intent: 'SUPPORT',
      riskFlags: ['A', 'B', 'C', 'D'],
      objections: [],
      unreadCount: 0,
    });
    expect(veryLow).toBeGreaterThanOrEqual(0.1);

    const veryHigh = inferConfidence({
      intent: 'BUYING',
      riskFlags: [],
      objections: ['price', 'trust', 'timing'],
      unreadCount: 99,
    });
    expect(veryHigh).toBeLessThanOrEqual(0.98);
  });

  it('returns a number with at most 3 decimal places', () => {
    const value = inferConfidence({
      intent: 'CURIOUS',
      riskFlags: [],
      objections: [],
      unreadCount: 1,
    });
    expect(value.toString()).toMatch(/^[0-9]+(\.[0-9]{1,3})?$/);
  });
});

describe('summarizeState', () => {
  it('includes intent, stage and next best action', () => {
    const summary = summarizeState({
      intent: 'BUYING',
      stage: 'HOT',
      objections: [],
      nextBestAction: 'OFFER',
      paymentState: 'NONE',
      trustScore: 0.5,
      urgencyScore: 0.7,
      riskFlags: [],
    });
    expect(summary).toContain('intenção buying');
    expect(summary).toContain('estágio hot');
    expect(summary).toContain('próxima ação offer');
  });

  it('omits the payment segment when paymentState is NONE', () => {
    const summary = summarizeState({
      intent: 'BUYING',
      stage: 'WARM',
      objections: [],
      nextBestAction: 'RESPOND',
      paymentState: 'NONE',
      trustScore: 0.3,
      urgencyScore: 0.3,
      riskFlags: [],
    });
    expect(summary).not.toContain('pagamento');
  });

  it('includes the payment segment when paymentState is not NONE', () => {
    const summary = summarizeState({
      intent: 'PAYMENT',
      stage: 'CHECKOUT',
      objections: [],
      nextBestAction: 'PAYMENT_RECOVERY',
      paymentState: 'PENDING',
      trustScore: 0.5,
      urgencyScore: 0.5,
      riskFlags: [],
    });
    expect(summary).toContain('pagamento pending');
  });

  it('includes objections list when non-empty', () => {
    const summary = summarizeState({
      intent: 'OBJECTION',
      stage: 'WARM',
      objections: ['price', 'trust'],
      nextBestAction: 'SOCIAL_PROOF',
      paymentState: 'NONE',
      trustScore: 0.4,
      urgencyScore: 0.4,
      riskFlags: [],
    });
    expect(summary).toContain('objeções price, trust');
  });

  it('formats trust and urgency as percentages', () => {
    const summary = summarizeState({
      intent: 'CURIOUS',
      stage: 'WARM',
      objections: [],
      nextBestAction: 'RESPOND',
      paymentState: 'NONE',
      trustScore: 0.42,
      urgencyScore: 0.91,
      riskFlags: [],
    });
    expect(summary).toContain('confiança 42%');
    expect(summary).toContain('urgência 91%');
  });

  it('includes risk flags when non-empty', () => {
    const summary = summarizeState({
      intent: 'SUPPORT',
      stage: 'SUPPORT',
      objections: [],
      nextBestAction: 'ESCALATE_HUMAN',
      paymentState: 'NONE',
      trustScore: 0.3,
      urgencyScore: 0.6,
      riskFlags: ['LEGAL_RISK', 'SUPPORT_REQUIRED'],
    });
    expect(summary).toContain('riscos LEGAL_RISK, SUPPORT_REQUIRED');
  });
});
