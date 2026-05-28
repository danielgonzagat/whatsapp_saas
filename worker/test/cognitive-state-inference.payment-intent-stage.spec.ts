import { describe, expect, it } from 'vitest';

import {
  inferIntent,
  inferPaymentState,
  inferStage,
} from '../processors/cia/cognitive-state/cognitive-state-inference';

describe('inferPaymentState', () => {
  it('returns PAID when the customer signals payment confirmation', () => {
    expect(inferPaymentState('paguei agora')).toBe('PAID');
    expect(inferPaymentState('foi compensado')).toBe('PAID');
  });

  it('returns PENDING when the customer asks for a payment instrument', () => {
    expect(inferPaymentState('manda o pix')).toBe('PENDING');
    expect(inferPaymentState('me passa o boleto por favor')).toBe('PENDING');
  });

  it('returns READY_TO_PAY when the customer signals intent to close', () => {
    expect(inferPaymentState('quero fechar agora')).toBe('READY_TO_PAY');
    expect(inferPaymentState('me cobra')).toBe('READY_TO_PAY');
  });

  it('returns NONE when no payment cue is detected', () => {
    expect(inferPaymentState('só uma duvida')).toBe('NONE');
    expect(inferPaymentState('')).toBe('NONE');
  });

  it('prefers PAID over READY_TO_PAY when both cues overlap', () => {
    expect(inferPaymentState('paguei, quero fechar')).toBe('PAID');
  });
});

describe('inferIntent', () => {
  it('returns PAYMENT whenever payment state is PENDING or READY_TO_PAY', () => {
    expect(inferIntent({ text: 'qualquer texto', unreadCount: 0, paymentState: 'PENDING' })).toBe(
      'PAYMENT',
    );
    expect(
      inferIntent({ text: 'qualquer texto', unreadCount: 0, paymentState: 'READY_TO_PAY' }),
    ).toBe('PAYMENT');
  });

  it('does NOT return PAYMENT when paymentState is PAID', () => {
    expect(inferIntent({ text: 'preco?', unreadCount: 0, paymentState: 'PAID' })).not.toBe(
      'PAYMENT',
    );
  });

  it('detects SUPPORT keywords ahead of BUYING keywords', () => {
    expect(
      inferIntent({
        text: 'preciso de suporte com pagamento',
        unreadCount: 0,
        paymentState: 'NONE',
      }),
    ).toBe('SUPPORT');
  });

  it('detects BUYING keywords', () => {
    expect(
      inferIntent({ text: 'quanto custa esse produto?', unreadCount: 0, paymentState: 'NONE' }),
    ).toBe('BUYING');
  });

  it('detects OBJECTION via trust hints', () => {
    expect(
      inferIntent({
        text: 'isso realmente funciona? tem garantia?',
        unreadCount: 0,
        paymentState: 'NONE',
      }),
    ).toBe('OBJECTION');
  });

  it('returns CURIOUS when leadScore is high', () => {
    expect(
      inferIntent({
        text: 'oi',
        unreadCount: 0,
        paymentState: 'NONE',
        leadScore: 80,
      }),
    ).toBe('CURIOUS');
  });

  it('returns CURIOUS when there is at least one unread message', () => {
    expect(inferIntent({ text: 'oi', unreadCount: 2, paymentState: 'NONE', leadScore: 10 })).toBe(
      'CURIOUS',
    );
  });

  it('returns UNKNOWN when nothing matches', () => {
    expect(
      inferIntent({ text: 'tudo bem', unreadCount: 0, paymentState: 'NONE', leadScore: 0 }),
    ).toBe('UNKNOWN');
  });

  it('treats null leadScore as zero', () => {
    expect(inferIntent({ text: 'oi', unreadCount: 0, paymentState: 'NONE', leadScore: null })).toBe(
      'UNKNOWN',
    );
  });
});

describe('inferStage', () => {
  it('returns SUPPORT regardless of trust/urgency when intent is SUPPORT', () => {
    expect(
      inferStage({
        intent: 'SUPPORT',
        paymentState: 'NONE',
        trustScore: 0.9,
        urgencyScore: 0.9,
      }),
    ).toBe('SUPPORT');
  });

  it('returns POST_SALE when paymentState is PAID', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'PAID',
        trustScore: 0.3,
        urgencyScore: 0.3,
      }),
    ).toBe('POST_SALE');
  });

  it('returns CHECKOUT when paymentState is PENDING or READY_TO_PAY', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'PENDING',
        trustScore: 0.3,
        urgencyScore: 0.3,
      }),
    ).toBe('CHECKOUT');
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'READY_TO_PAY',
        trustScore: 0.3,
        urgencyScore: 0.3,
      }),
    ).toBe('CHECKOUT');
  });

  it('returns HOT when BUYING intent has high trust score', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'NONE',
        trustScore: 0.6,
        urgencyScore: 0.1,
      }),
    ).toBe('HOT');
  });

  it('returns HOT when BUYING intent has high urgency score', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'NONE',
        trustScore: 0.3,
        urgencyScore: 0.75,
      }),
    ).toBe('HOT');
  });

  it('returns WARM when intent is BUYING but neither trust nor urgency is high', () => {
    expect(
      inferStage({
        intent: 'BUYING',
        paymentState: 'NONE',
        trustScore: 0.2,
        urgencyScore: 0.2,
      }),
    ).toBe('WARM');
  });

  it('returns WARM for CURIOUS and OBJECTION intents', () => {
    expect(
      inferStage({
        intent: 'CURIOUS',
        paymentState: 'NONE',
        trustScore: 0.5,
        urgencyScore: 0.5,
      }),
    ).toBe('WARM');
    expect(
      inferStage({
        intent: 'OBJECTION',
        paymentState: 'NONE',
        trustScore: 0.5,
        urgencyScore: 0.5,
      }),
    ).toBe('WARM');
  });

  it('returns COLD when intent is UNKNOWN', () => {
    expect(
      inferStage({
        intent: 'UNKNOWN',
        paymentState: 'NONE',
        trustScore: 0.5,
        urgencyScore: 0.5,
      }),
    ).toBe('COLD');
  });
});
