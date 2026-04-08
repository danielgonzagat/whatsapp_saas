import { describe, expect, it } from 'vitest';
import {
  buildConversationTacticPlan,
  assertConversationTacticPlan,
} from '../processors/cia/conversation-tactics';
import { buildSeedCognitiveState } from '../processors/cia/cognitive-state';

function buildState(overrides?: Partial<Parameters<typeof buildSeedCognitiveState>[0]>) {
  return buildSeedCognitiveState({
    conversationId: 'conv-1',
    contactId: 'contact-1',
    phone: '5511999999999',
    lastMessageText: 'quanto custa e como funciona?',
    unreadCount: 1,
    lastMessageAt: new Date(),
    leadScore: 80,
    ...overrides,
  });
}

describe('cia-conversation-tactics', () => {
  it('keeps an exhaustive tactic universe for executable actions', () => {
    const states = [
      { action: 'RESPOND', state: buildState() },
      {
        action: 'ASK_CLARIFYING',
        state: buildState({ lastMessageText: 'quero entender melhor antes' }),
      },
      {
        action: 'SOCIAL_PROOF',
        state: buildState({ lastMessageText: 'isso funciona mesmo? posso confiar?' }),
      },
      { action: 'OFFER', state: buildState({ lastMessageText: 'quero fechar hoje' }) },
      {
        action: 'PAYMENT_RECOVERY',
        state: buildState({ lastMessageText: 'me manda o pix novamente' }),
      },
      {
        action: 'FOLLOWUP_SOFT',
        state: buildState({ unreadCount: 0, lastMessageText: 'vou pensar' }),
      },
      {
        action: 'FOLLOWUP_URGENT',
        state: buildState({ unreadCount: 0, lastMessageText: 'preciso resolver hoje' }),
      },
    ] as const;

    for (const item of states) {
      const plan = buildConversationTacticPlan(item);
      expect(() => assertConversationTacticPlan(plan)).not.toThrow();
      expect(plan.selectedTactic).toBeTruthy();
      expect(plan.executableCount).toBeGreaterThan(0);
      expect(plan.silentCount).toBe(0);
      expect(plan.candidates.some((candidate) => candidate.tactic === plan.selectedTactic)).toBe(
        true,
      );
    }
  });

  it('allows empty tactic universe only for wait or human escalation', () => {
    const waitPlan = buildConversationTacticPlan({
      action: 'WAIT',
      state: buildState(),
    });
    const escalatePlan = buildConversationTacticPlan({
      action: 'ESCALATE_HUMAN',
      state: buildState({ lastMessageText: 'vou no procon' }),
    });

    expect(() => assertConversationTacticPlan(waitPlan)).not.toThrow();
    expect(() => assertConversationTacticPlan(escalatePlan)).not.toThrow();
    expect(waitPlan.selectedTactic).toBeNull();
    expect(escalatePlan.selectedTactic).toBeNull();
  });
});
