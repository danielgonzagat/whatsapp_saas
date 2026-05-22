import { ValenceTaggerService } from './valence-tagger.service';
import { SpineEventRef } from './mind.types';

function makeEvent(overrides: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: 'evt_001',
    eventName: 'commerce.payment.approved',
    occurredAt: new Date().toISOString(),
    truthMode: 'observed',
    ...overrides,
  };
}

describe('ValenceTaggerService', () => {
  let service: ValenceTaggerService;

  beforeEach(() => {
    service = new ValenceTaggerService();
  });

  describe('tag', () => {
    it('leaves already-tagged events unchanged', () => {
      const event = makeEvent({ valence: 'positive' });
      const result = service.tag(event);
      expect(result).toBe(event);
    });

    it('leaves non-terminal events unchanged', () => {
      const event = makeEvent({
        eventName: 'commerce.lead.contacted',
        valence: undefined,
      });
      const result = service.tag(event);
      expect(result).toBe(event);
    });

    it('tags a terminal event with its default valence', () => {
      const event = makeEvent({
        eventName: 'commerce.payment.approved',
        valence: undefined,
      });
      const result = service.tag(event);
      expect(result.valence).toBe('positive');
      expect(result.eventId).toBe(event.eventId);
    });

    it('tags commerce.payment.declined as negative', () => {
      const event = makeEvent({
        eventName: 'commerce.payment.declined',
        valence: undefined,
      });
      const result = service.tag(event);
      expect(result.valence).toBe('negative');
    });

    it('tags commerce.post_sale.churn_risk_detected as negative', () => {
      const event = makeEvent({
        eventName: 'commerce.post_sale.churn_risk_detected',
        valence: undefined,
      });
      const result = service.tag(event);
      expect(result.valence).toBe('negative');
    });

    it('tags commerce.whatsapp.message_received as neutral', () => {
      const event = makeEvent({
        eventName: 'commerce.whatsapp.message_received',
        valence: undefined,
      });
      const result = service.tag(event);
      expect(result.valence).toBe('neutral');
    });

    it('leaves a terminal event without a default mapping unchanged', () => {
      // commerce.lead.replied is NOT in TERMINAL_EVENT_NAMES
      const event = makeEvent({
        eventName: 'commerce.lead.replied',
        valence: undefined,
      });
      const result = service.tag(event);
      expect(result).toBe(event);
      expect(result.valence).toBeUndefined();
    });

    it('does not mutate the original event object', () => {
      const event = makeEvent({
        eventName: 'commerce.payment.approved',
        valence: undefined,
      });
      service.tag(event);
      expect(event.valence).toBeUndefined();
    });
  });

  describe('tagBatch', () => {
    it('tags all events in a batch', () => {
      const events = [
        makeEvent({ eventId: 'evt_1', eventName: 'commerce.payment.approved', valence: undefined }),
        makeEvent({ eventId: 'evt_2', eventName: 'commerce.payment.declined', valence: undefined }),
        makeEvent({ eventId: 'evt_3', eventName: 'commerce.lead.contacted', valence: undefined }),
      ];
      const result = service.tagBatch(events);
      expect(result[0]!.valence).toBe('positive');
      expect(result[1]!.valence).toBe('negative');
      expect(result[2]!.valence).toBeUndefined();
      expect(result.length).toBe(3);
    });

    it('returns an empty array for empty input', () => {
      expect(service.tagBatch([])).toEqual([]);
    });
  });

  describe('requiresValence', () => {
    it('returns true for terminal events', () => {
      expect(service.requiresValence('commerce.payment.approved')).toBe(true);
      expect(service.requiresValence('commerce.crm.deal_won')).toBe(true);
      expect(service.requiresValence('commerce.post_sale.churn_risk_detected')).toBe(true);
    });

    it('returns false for non-terminal events', () => {
      expect(service.requiresValence('commerce.lead.contacted')).toBe(false);
      expect(service.requiresValence('commerce.cart.created')).toBe(false);
      expect(service.requiresValence('unknown.event')).toBe(false);
    });
  });

  describe('coverage', () => {
    it('computes 100% coverage when all terminal events are tagged', () => {
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({
          eventId: 'evt_2',
          eventName: 'commerce.payment.declined',
          valence: 'negative',
        }),
      ];
      const result = service.coverage(events);
      expect(result.terminalCount).toBe(2);
      expect(result.taggedCount).toBe(2);
      expect(result.coveragePct).toBe(100);
    });

    it('computes 50% coverage when half of terminal events are untagged', () => {
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({ eventId: 'evt_2', eventName: 'commerce.payment.declined', valence: undefined }),
      ];
      const result = service.coverage(events);
      expect(result.terminalCount).toBe(2);
      expect(result.taggedCount).toBe(1);
      expect(result.coveragePct).toBe(50);
    });

    it('returns 100% coverage when there are no terminal events', () => {
      const events = [
        makeEvent({ eventId: 'evt_1', eventName: 'commerce.lead.contacted', valence: undefined }),
        makeEvent({ eventId: 'evt_2', eventName: 'commerce.cart.created', valence: undefined }),
      ];
      const result = service.coverage(events);
      expect(result.terminalCount).toBe(0);
      expect(result.taggedCount).toBe(0);
      expect(result.coveragePct).toBe(100);
    });

    it('returns 0% coverage when all terminal events are untagged', () => {
      const events = [
        makeEvent({ eventId: 'evt_1', eventName: 'commerce.payment.approved', valence: undefined }),
        makeEvent({ eventId: 'evt_2', eventName: 'commerce.crm.deal_won', valence: undefined }),
      ];
      const result = service.coverage(events);
      expect(result.terminalCount).toBe(2);
      expect(result.taggedCount).toBe(0);
      expect(result.coveragePct).toBe(0);
    });

    it('ignores non-terminal events in the count', () => {
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({ eventId: 'evt_2', eventName: 'commerce.lead.contacted', valence: 'positive' }),
      ];
      const result = service.coverage(events);
      expect(result.terminalCount).toBe(1);
      expect(result.taggedCount).toBe(1);
      expect(result.coveragePct).toBe(100);
    });
  });
});
