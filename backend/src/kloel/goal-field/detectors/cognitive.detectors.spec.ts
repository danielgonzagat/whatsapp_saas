import {
  conversationWithoutValenceDetector,
  decisionWithoutPersistenceDetector,
  ev,
  NOW,
} from './cognitive.detectors.spec.helpers';

describe('Cognitive detectors — COG-001: decision_without_persistence', () => {
  it('fires when reply has no matching cognition.* trace', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_1',
        eventId: 'reply_1',
      }),
    ];
    const tens = decisionWithoutPersistenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.detectorName).toBe('cognitive.decision_without_persistence');
    expect(tens[0]?.severity).toBeCloseTo(0.6);
    expect(tens[0]?.evidenceEventIds).toEqual(['reply_1']);
    expect(tens[0]?.dimension).toBe('cognitive');
  });

  it('is silent when reply has matching cognition.* trace', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_1',
        eventId: 'reply_1',
      }),
      ev({
        eventName: 'cognition.analysis_started',
        correlationId: 'corr_1',
        eventId: 'cog_1',
      }),
    ];
    expect(decisionWithoutPersistenceDetector.detect(events, NOW)).toHaveLength(0);
  });

  it('is silent when no reply events exist', () => {
    const events = [ev({ eventName: 'commerce.lead.replied' })];
    expect(decisionWithoutPersistenceDetector.detect(events, NOW)).toHaveLength(0);
  });

  it('fires for multiple uncorrelated replies independently', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_a',
        eventId: 'r_a',
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_b',
        eventId: 'r_b',
      }),
    ];
    const tens = decisionWithoutPersistenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(2);
    expect(tens.map((t) => t.evidenceEventIds[0]).sort()).toEqual(['r_a', 'r_b']);
  });

  it('only fires for unmatched replies when some are matched', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_1',
        eventId: 'r_1',
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        correlationId: 'corr_2',
        eventId: 'r_2',
      }),
      ev({
        eventName: 'cognition.decision_made',
        correlationId: 'corr_2',
        eventId: 'c_2',
      }),
    ];
    const tens = decisionWithoutPersistenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.evidenceEventIds).toEqual(['r_1']);
  });
});

describe('Cognitive detectors — COG-002: conversation_without_valence', () => {
  it('fires on deal_won without valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_1',
        eventId: 'deal_1',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.detectorName).toBe('cognitive.conversation_without_valence');
    expect(tens[0]?.severity).toBe(0.55);
  });

  it('fires on deal_lost without valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_lost',
        correlationId: 'corr_1',
        eventId: 'deal_1',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.description).toContain('deal_lost');
  });

  it('fires on payment.approved without valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.payment.approved',
        correlationId: 'corr_1',
        eventId: 'pay_1',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.description).toContain('payment.approved');
  });

  it('fires on payment.refunded without valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.payment.refunded',
        correlationId: 'corr_1',
        eventId: 'ref_1',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.description).toContain('payment.refunded');
  });

  it('is silent when terminal event has valence_assigned', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_1',
        eventId: 'deal_1',
      }),
      ev({
        eventName: 'cognition.valence_assigned',
        correlationId: 'corr_1',
        eventId: 'val_1',
      }),
    ];
    expect(conversationWithoutValenceDetector.detect(events, NOW)).toHaveLength(0);
  });

  it('is silent when no terminal events exist', () => {
    const events = [ev({ eventName: 'commerce.lead.replied' })];
    expect(conversationWithoutValenceDetector.detect(events, NOW)).toHaveLength(0);
  });

  it('fires for each unmatched terminal event', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_a',
        eventId: 'd_a',
      }),
      ev({
        eventName: 'commerce.crm.deal_lost',
        correlationId: 'corr_b',
        eventId: 'd_b',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(2);
  });

  it('correctly identifies matched vs unmatched in mixed set', () => {
    const events = [
      ev({
        eventName: 'commerce.crm.deal_won',
        correlationId: 'corr_a',
        eventId: 'd_a',
      }),
      ev({
        eventName: 'commerce.payment.approved',
        correlationId: 'corr_b',
        eventId: 'p_b',
      }),
      ev({
        eventName: 'cognition.valence_assigned',
        correlationId: 'corr_a',
        eventId: 'v_a',
      }),
    ];
    const tens = conversationWithoutValenceDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.evidenceEventIds).toEqual(['p_b']);
  });
});
