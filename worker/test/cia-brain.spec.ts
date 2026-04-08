import { describe, expect, it } from 'vitest';
import { planCiaActions } from '../processors/cia/brain';

describe('cia-brain', () => {
  it('prioritizes payment recovery and hot leads while respecting the action cap', () => {
    const state: any = {
      workspaceId: 'ws-1',
      generatedAt: new Date().toISOString(),
      snapshot: {
        openBacklog: 18,
        hotLeadCount: 4,
        pendingPaymentCount: 2,
      },
      marketSignals: [],
      candidates: [
        {
          conversationId: 'conv-payment',
          contactId: 'contact-payment',
          phone: '5511999999991',
          contactName: 'Pagamento',
          unreadCount: 0,
          lastMessageText: 'me manda o pix novamente',
          priority: 99,
          cluster: 'PAYMENT',
          suggestedAction: 'PAYMENT_RECOVERY',
          demandState: { attentionScore: 1.1 },
          silenceMinutes: 90,
          cognitiveState: {
            intent: 'PAYMENT',
            stage: 'CHECKOUT',
            trustScore: 0.78,
            urgencyScore: 0.84,
            priceSensitivity: 0.4,
            objections: ['price'],
            desires: ['facilidade_pagamento'],
            trustSignals: ['buying_signal'],
            nextBestAction: 'PAYMENT_RECOVERY',
            silenceMinutes: 90,
            ltvEstimate: 420,
            paymentState: 'PENDING',
            riskFlags: [],
            classificationConfidence: 0.88,
            summary: 'checkout pendente',
            updatedAt: new Date().toISOString(),
          },
        },
        {
          conversationId: 'conv-hot',
          contactId: 'contact-hot',
          phone: '5511999999992',
          contactName: 'Quente',
          unreadCount: 2,
          lastMessageText: 'quanto custa o serum?',
          priority: 97,
          cluster: 'HOT',
          suggestedAction: 'RESPOND',
          demandState: { attentionScore: 1.02 },
          silenceMinutes: 5,
          cognitiveState: {
            intent: 'BUYING',
            stage: 'HOT',
            trustScore: 0.67,
            urgencyScore: 0.74,
            priceSensitivity: 0.65,
            objections: ['price'],
            desires: ['resultado_rapido'],
            trustSignals: ['buying_signal'],
            nextBestAction: 'OFFER',
            silenceMinutes: 5,
            ltvEstimate: 380,
            paymentState: 'NONE',
            riskFlags: [],
            classificationConfidence: 0.83,
            summary: 'lead quente',
            updatedAt: new Date().toISOString(),
          },
        },
        {
          conversationId: 'conv-warm',
          contactId: 'contact-warm',
          phone: '5511999999993',
          contactName: 'Morno',
          unreadCount: 0,
          lastMessageText: 'ainda estou pensando',
          priority: 72,
          cluster: 'WARM',
          suggestedAction: 'FOLLOWUP_SOFT',
          demandState: { attentionScore: 0.7 },
          silenceMinutes: 720,
          cognitiveState: {
            intent: 'CURIOUS',
            stage: 'WARM',
            trustScore: 0.52,
            urgencyScore: 0.28,
            priceSensitivity: 0.2,
            objections: [],
            desires: [],
            trustSignals: [],
            nextBestAction: 'FOLLOWUP_SOFT',
            silenceMinutes: 720,
            ltvEstimate: 210,
            paymentState: 'NONE',
            riskFlags: [],
            classificationConfidence: 0.72,
            summary: 'lead morno',
            updatedAt: new Date().toISOString(),
          },
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
    expect(batch.actions.map((item) => item.type)).toContain('PAYMENT_RECOVERY');
    expect(batch.actions.map((item) => item.type)).toEqual(
      expect.arrayContaining(['PAYMENT_RECOVERY']),
    );
    expect(
      batch.actions
        .map((item) => item.type)
        .some((type) => ['RESPOND', 'OFFER', 'ASK_CLARIFYING', 'SOCIAL_PROOF'].includes(type)),
    ).toBe(true);
    expect(batch.summary).toContain('2 frentes');
  });

  it('uses global strategy hints to expand the cycle and prefer payment recovery', () => {
    const state: any = {
      workspaceId: 'ws-1',
      generatedAt: new Date().toISOString(),
      snapshot: {
        openBacklog: 24,
        hotLeadCount: 2,
        pendingPaymentCount: 3,
      },
      marketSignals: [],
      candidates: [
        {
          conversationId: 'conv-payment-1',
          contactId: 'contact-payment-1',
          priority: 88,
          unreadCount: 0,
          lastMessageText: 'manda o pix de novo',
          cluster: 'PAYMENT',
          suggestedAction: 'PAYMENT_RECOVERY',
          demandState: { attentionScore: 0.9 },
          silenceMinutes: 180,
          cognitiveState: {
            intent: 'PAYMENT',
            stage: 'CHECKOUT',
            trustScore: 0.76,
            urgencyScore: 0.86,
            priceSensitivity: 0.4,
            objections: [],
            desires: [],
            trustSignals: [],
            nextBestAction: 'PAYMENT_RECOVERY',
            silenceMinutes: 180,
            ltvEstimate: 410,
            paymentState: 'PENDING',
            riskFlags: [],
            classificationConfidence: 0.9,
            summary: 'checkout pendente',
            updatedAt: new Date().toISOString(),
          },
        },
        {
          conversationId: 'conv-followup-1',
          contactId: 'contact-followup-1',
          priority: 89,
          unreadCount: 0,
          lastMessageText: 'depois eu vejo',
          cluster: 'WARM',
          suggestedAction: 'FOLLOWUP_SOFT',
          demandState: { attentionScore: 0.7 },
          silenceMinutes: 480,
          cognitiveState: {
            intent: 'CURIOUS',
            stage: 'WARM',
            trustScore: 0.48,
            urgencyScore: 0.32,
            priceSensitivity: 0.15,
            objections: [],
            desires: [],
            trustSignals: [],
            nextBestAction: 'FOLLOWUP_SOFT',
            silenceMinutes: 480,
            ltvEstimate: 180,
            paymentState: 'NONE',
            riskFlags: [],
            classificationConfidence: 0.68,
            summary: 'warm followup',
            updatedAt: new Date().toISOString(),
          },
        },
        {
          conversationId: 'conv-followup-2',
          contactId: 'contact-followup-2',
          priority: 74,
          unreadCount: 0,
          lastMessageText: 'estou pensando',
          cluster: 'COLD',
          suggestedAction: 'FOLLOWUP_SOFT',
          demandState: { attentionScore: 0.5 },
          silenceMinutes: 1500,
          cognitiveState: {
            intent: 'UNKNOWN',
            stage: 'COLD',
            trustScore: 0.3,
            urgencyScore: 0.2,
            priceSensitivity: 0.1,
            objections: [],
            desires: [],
            trustSignals: [],
            nextBestAction: 'FOLLOWUP_URGENT',
            silenceMinutes: 1500,
            ltvEstimate: 120,
            paymentState: 'NONE',
            riskFlags: [],
            classificationConfidence: 0.62,
            summary: 'cold reengagement',
            updatedAt: new Date().toISOString(),
          },
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
        aggressiveness: 'HIGH',
        preferredVariantFamily: 'payment_recovery',
      },
    });

    expect(batch.actions).toHaveLength(3);
    expect(batch.actions[0]?.type).toBe('PAYMENT_RECOVERY');
  });
});
