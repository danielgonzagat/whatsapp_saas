import { describe, expect, it } from 'vitest';

import {
  inferNextBestAction,
  type NextActionInput,
} from '../processors/cia/cognitive-state/cognitive-state-inference';

const buildNextActionInput = (overrides: Partial<NextActionInput> = {}): NextActionInput => ({
  intent: 'UNKNOWN',
  stage: 'COLD',
  unreadCount: 0,
  silenceMinutes: 0,
  trustScore: 0.5,
  urgencyScore: 0.3,
  priceSensitivity: 0.5,
  paymentState: 'NONE',
  riskFlags: [],
  objections: [],
  desires: [],
  confidence: 0.7,
  ...overrides,
});

describe('inferNextBestAction', () => {
  it('returns ESCALATE_HUMAN when every risk flag is present', () => {
    expect(
      inferNextBestAction(buildNextActionInput({ riskFlags: ['LEGAL_RISK'], unreadCount: 5 })),
    ).toBe('ESCALATE_HUMAN');
  });

  it('returns ASK_CLARIFYING for UNKNOWN intent with unread messages and low confidence', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({ intent: 'UNKNOWN', unreadCount: 1, confidence: 0.5 }),
      ),
    ).toBe('ASK_CLARIFYING');
  });

  it('does NOT ASK_CLARIFYING when confidence is at or above 0.68', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({ intent: 'UNKNOWN', unreadCount: 1, confidence: 0.68 }),
      ),
    ).not.toBe('ASK_CLARIFYING');
  });

  it('returns PAYMENT_RECOVERY when payment state is PENDING', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          unreadCount: 1,
          paymentState: 'PENDING',
        }),
      ),
    ).toBe('PAYMENT_RECOVERY');
  });

  it('returns PAYMENT_RECOVERY when payment state is READY_TO_PAY', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          unreadCount: 1,
          paymentState: 'READY_TO_PAY',
        }),
      ),
    ).toBe('PAYMENT_RECOVERY');
  });

  it('returns PAYMENT_RECOVERY when intent is PAYMENT', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'PAYMENT',
          unreadCount: 1,
        }),
      ),
    ).toBe('PAYMENT_RECOVERY');
  });

  it('returns SOCIAL_PROOF when price objection meets low trust on an unread', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          unreadCount: 1,
          objections: ['price'],
          trustScore: 0.5,
          confidence: 0.8,
        }),
      ),
    ).toBe('SOCIAL_PROOF');
  });

  it('returns OFFER on unread when stage is HOT', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          stage: 'HOT',
          unreadCount: 1,
          trustScore: 0.7,
          confidence: 0.8,
        }),
      ),
    ).toBe('OFFER');
  });

  it('returns OFFER on unread when stage is CHECKOUT', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          stage: 'CHECKOUT',
          unreadCount: 1,
          paymentState: 'NONE',
          confidence: 0.8,
        }),
      ),
    ).toBe('OFFER');
  });

  it('returns OFFER on unread when urgency is high', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          unreadCount: 1,
          urgencyScore: 0.8,
          confidence: 0.8,
        }),
      ),
    ).toBe('OFFER');
  });

  it('returns OFFER on unread when desires include resultado_rapido', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'BUYING',
          unreadCount: 1,
          desires: ['resultado_rapido'],
          confidence: 0.8,
        }),
      ),
    ).toBe('OFFER');
  });

  it('returns RESPOND on plain unread', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'WARM',
          unreadCount: 1,
          confidence: 0.8,
        }),
      ),
    ).toBe('RESPOND');
  });

  it('returns FOLLOWUP_URGENT after a full day of silence', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'WARM',
          unreadCount: 0,
          silenceMinutes: 24 * 60,
        }),
      ),
    ).toBe('FOLLOWUP_URGENT');
  });

  it('returns FOLLOWUP_URGENT when HOT stage has high urgency', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'HOT',
          unreadCount: 0,
          silenceMinutes: 60,
          urgencyScore: 0.75,
        }),
      ),
    ).toBe('FOLLOWUP_URGENT');
  });

  it('returns FOLLOWUP_SOFT after a soft-silence window', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'COLD',
          unreadCount: 0,
          silenceMinutes: 6 * 60,
        }),
      ),
    ).toBe('FOLLOWUP_SOFT');
  });

  it('returns FOLLOWUP_SOFT for WARM stages without urgent silence', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'WARM',
          unreadCount: 0,
          silenceMinutes: 10,
        }),
      ),
    ).toBe('FOLLOWUP_SOFT');
  });

  it('returns WAIT as the default silent fallback', () => {
    expect(
      inferNextBestAction(
        buildNextActionInput({
          intent: 'CURIOUS',
          stage: 'COLD',
          unreadCount: 0,
          silenceMinutes: 5,
        }),
      ),
    ).toBe('WAIT');
  });
});
