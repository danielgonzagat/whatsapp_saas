import { describe, it, expect } from 'vitest';
import {
  computeReplyStyleBudget,
  finalizeReplyStyle,
  buildMirroredReplyPlanFallback,
} from '../processors/autopilot/autopilot-reply';

describe('computeReplyStyleBudget', () => {
  it('computes budget for short message', () => {
    const budget = computeReplyStyleBudget('oi', 0);
    expect(budget.maxSentences).toBe(2);
    expect(budget.maxWords).toBe(26);
    expect(budget.words).toBe(1);
  });

  it('computes budget for medium message', () => {
    const budget = computeReplyStyleBudget('ola como vai voce tudo bem por ai', 0);
    expect(budget.maxSentences).toBe(3);
    expect(budget.words).toBeGreaterThan(0);
  });

  it('computes budget for long message', () => {
    const message = Array(25).fill('palavra').join(' ');
    const budget = computeReplyStyleBudget(message, 0);
    expect(budget.maxSentences).toBe(4);
    expect(budget.maxWords).toBeGreaterThan(0);
  });

  it('increases budget for conversation with 6+ turns', () => {
    const baseline = computeReplyStyleBudget('oi', 0);
    const enhanced = computeReplyStyleBudget('oi', 6);
    expect(enhanced.maxSentences).toBe(baseline.maxSentences + 1);
    expect(enhanced.maxWords).toBe(baseline.maxWords + 24);
  });

  it('increases budget further for conversation with 10+ turns', () => {
    const baseline = computeReplyStyleBudget('oi', 0);
    const enhanced = computeReplyStyleBudget('oi', 10);
    expect(enhanced.maxSentences).toBe(baseline.maxSentences + 2);
    expect(enhanced.maxWords).toBe(baseline.maxWords + 60);
  });

  it('defaults historyTurns to 0', () => {
    const budget = computeReplyStyleBudget('hello');
    expect(budget.words).toBeGreaterThan(0);
  });
});

describe('finalizeReplyStyle', () => {
  it('returns undefined for empty reply', () => {
    const result = finalizeReplyStyle('customer msg', null);
    expect(result).toBeUndefined();
  });

  it('returns undefined for whitespace-only reply', () => {
    const result = finalizeReplyStyle('customer msg', '   ');
    expect(result).toBeUndefined();
  });

  it('trims and normalizes reply', () => {
    const result = finalizeReplyStyle('customer msg', '  Hello  world   ');
    expect(result).toBe('Hello world');
  });

  it('strips emoji when customer did not use emoji', () => {
    const result = finalizeReplyStyle('plain text', 'Hello 👋 world');
    expect(result).not.toContain('👋');
  });

  it('preserves emoji when customer used emoji', () => {
    const result = finalizeReplyStyle('oi 👋 tudo bem', 'Olá 👋 como vai');
    expect(result).toContain('👋');
  });

  it('strips list bullet markers', () => {
    const result = finalizeReplyStyle('oi', '- item 1 - item 2');
    expect(result).not.toContain('-');
  });

  it('joins multiple sentences', () => {
    const result = finalizeReplyStyle('customer message', 'Sim. Claro. Vamos la.');
    expect(result).toBeTruthy();
  });
});

describe('buildMirroredReplyPlanFallback', () => {
  it('returns single reply for single customer message', () => {
    const plan = buildMirroredReplyPlanFallback(
      [{ quotedMessageId: 'msg1', content: 'Oi, quero comprar' }],
      'Ola! Vamos prosseguir.',
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].quotedMessageId).toBe('msg1');
    expect(plan[0].text).toBeTruthy();
  });

  it('distributes sentences across multiple messages', () => {
    const plan = buildMirroredReplyPlanFallback(
      [
        { quotedMessageId: 'm1', content: 'Primeira pergunta' },
        { quotedMessageId: 'm2', content: 'Segunda pergunta longa com mais detalhes' },
        { quotedMessageId: 'm3', content: 'Terceira questao' },
      ],
      'Sim, entendo. Vamos resolver isso. Podemos agendar uma call.',
    );
    expect(plan.length).toBe(3);
    expect(plan[0].quotedMessageId).toBe('m1');
    expect(plan[1].quotedMessageId).toBe('m2');
    expect(plan[2].quotedMessageId).toBe('m3');
  });

  it('handles empty customer messages array', () => {
    const plan = buildMirroredReplyPlanFallback([], 'Reply');
    expect(plan).toEqual([]);
  });
});
