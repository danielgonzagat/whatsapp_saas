import {
  AUTOPILOT_SUCCESS_INTENTS,
  CONVERSION_CLOSED_STATUSES,
  applySurprise,
  autopilotSuccessOutcome,
  buildCheckoutStartFeatures,
  buildMessageSentFeatures,
  classifyToolCategory,
  createEmptyResult,
  extractMessageReceivedText,
  isCheckoutClosedFailure,
  outcomeFromPayload,
  type MindEventProcessAccumulator,
} from './mind-event-processor.service.helpers';
import type { MindPerceptEvent } from '../../mind.types';

const baseEvent = (overrides: Partial<MindPerceptEvent>): MindPerceptEvent => ({
  kind: 'message.sent',
  workspaceId: 'ws-1',
  subject: 'contact:lead-1',
  payload: {},
  occurredAt: new Date('2026-05-09T12:34:56.000Z'),
  ...overrides,
});

describe('mind-event-processor.service.helpers', () => {
  describe('createEmptyResult', () => {
    it('returns a zeroed accumulator', () => {
      expect(createEmptyResult()).toStrictEqual({
        predicted: 0,
        resolved: 0,
        surpriseTotal: 0,
        beliefsUpdated: 0,
      });
    });

    it('returns a fresh instance per call', () => {
      const a = createEmptyResult();
      const b = createEmptyResult();
      a.predicted = 5;
      expect(b.predicted).toBe(0);
    });
  });

  describe('applySurprise', () => {
    it('increments resolved, beliefsUpdated, surpriseTotal when surprise > 0', () => {
      const acc: MindEventProcessAccumulator = createEmptyResult();
      applySurprise(acc, 0.7);
      expect(acc).toStrictEqual({
        predicted: 0,
        resolved: 1,
        surpriseTotal: 0.7,
        beliefsUpdated: 1,
      });
    });

    it('is a no-op for surprise === 0', () => {
      const acc = createEmptyResult();
      applySurprise(acc, 0);
      expect(acc).toStrictEqual(createEmptyResult());
    });

    it('is a no-op for negative surprise', () => {
      const acc = createEmptyResult();
      applySurprise(acc, -1.5);
      expect(acc).toStrictEqual(createEmptyResult());
    });

    it('accumulates surpriseTotal across multiple calls', () => {
      const acc = createEmptyResult();
      applySurprise(acc, 0.4);
      applySurprise(acc, 0.6);
      expect(acc.surpriseTotal).toBeCloseTo(1.0);
      expect(acc.resolved).toBe(2);
      expect(acc.beliefsUpdated).toBe(2);
    });
  });

  describe('buildMessageSentFeatures', () => {
    it('extracts channel/hour/template from payload', () => {
      const event = baseEvent({
        payload: { channel: 'whatsapp', template: 'welcome' },
        occurredAt: new Date('2026-05-09T15:00:00.000Z'),
      });
      const features = buildMessageSentFeatures(event);
      expect(features.channel).toBe('whatsapp');
      expect(features.hour).toBe(new Date('2026-05-09T15:00:00.000Z').getHours());
      expect(typeof features.template).toBe('string');
    });

    it("defaults channel to 'unknown' when payload.channel is missing", () => {
      const event = baseEvent({ payload: {} });
      expect(buildMessageSentFeatures(event).channel).toBe('unknown');
    });
  });

  describe('buildCheckoutStartFeatures', () => {
    it("returns 'checkout' channel and propagates priceBand + utmSource", () => {
      const event = baseEvent({
        kind: 'checkout.start',
        payload: { priceBand: 'over_500', utmSource: 'meta' },
        occurredAt: new Date('2026-05-09T09:00:00.000Z'),
      });
      const features = buildCheckoutStartFeatures(event);
      expect(features).toStrictEqual({
        channel: 'checkout',
        hour: new Date('2026-05-09T09:00:00.000Z').getHours(),
        price_band: 'over_500',
        segment: 'meta',
      });
    });

    it("defaults price_band to 'under_100' and segment to 'direct'", () => {
      const event = baseEvent({ kind: 'checkout.start', payload: {} });
      const features = buildCheckoutStartFeatures(event);
      expect(features.price_band).toBe('under_100');
      expect(features.segment).toBe('direct');
    });
  });

  describe('extractMessageReceivedText', () => {
    it('prefers payload.content over payload.message', () => {
      const event = baseEvent({ payload: { content: 'real', message: 'fallback' } });
      expect(extractMessageReceivedText(event)).toBe('real');
    });

    it('falls back to payload.message when content is absent', () => {
      const event = baseEvent({ payload: { message: 'fallback' } });
      expect(extractMessageReceivedText(event)).toBe('fallback');
    });

    it('returns empty string when neither key is present', () => {
      const event = baseEvent({ payload: {} });
      expect(extractMessageReceivedText(event)).toBe('');
    });
  });

  describe('isCheckoutClosedFailure', () => {
    it('returns true for checkout.expired regardless of status', () => {
      const event = baseEvent({ kind: 'checkout.expired', payload: {} });
      expect(isCheckoutClosedFailure(event)).toBe(true);
    });

    it.each(['CANCELED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED'])(
      'returns true for any checkout.* event with closed status %s',
      (status) => {
        const event = baseEvent({ kind: 'checkout.canceled', payload: { status } });
        expect(isCheckoutClosedFailure(event)).toBe(true);
      },
    );

    it('uppercases status before comparing', () => {
      const event = baseEvent({ kind: 'checkout.canceled', payload: { status: 'failed' } });
      expect(isCheckoutClosedFailure(event)).toBe(true);
    });

    it('returns false for checkout.paid (success short-circuit)', () => {
      const event = baseEvent({ kind: 'checkout.paid', payload: { status: 'FAILED' } });
      expect(isCheckoutClosedFailure(event)).toBe(false);
    });

    it('returns false for unrelated kinds', () => {
      const event = baseEvent({ kind: 'message.sent', payload: { status: 'FAILED' } });
      expect(isCheckoutClosedFailure(event)).toBe(false);
    });

    it('returns false for checkout.* with unknown status', () => {
      const event = baseEvent({ kind: 'checkout.pending', payload: { status: 'in_progress' } });
      expect(isCheckoutClosedFailure(event)).toBe(false);
    });
  });

  describe('autopilotSuccessOutcome', () => {
    it('maps purchase_intent to outcome=1 with conversion predicate', () => {
      expect(autopilotSuccessOutcome('purchase_intent')).toStrictEqual({
        outcome: 1,
        predicate: 'P(conversion|segment,price_band,channel,hour)',
      });
    });

    it('maps lead_qualified to outcome=0 with reply predicate', () => {
      expect(autopilotSuccessOutcome('lead_qualified')).toStrictEqual({
        outcome: 0,
        predicate: 'P(reply|template,hour,channel)',
      });
    });

    it('maps meeting_booked to outcome=0 with reply predicate', () => {
      expect(autopilotSuccessOutcome('meeting_booked')).toStrictEqual({
        outcome: 0,
        predicate: 'P(reply|template,hour,channel)',
      });
    });

    it('returns null for unrecognised intents', () => {
      expect(autopilotSuccessOutcome('random_intent')).toBeNull();
      expect(autopilotSuccessOutcome('')).toBeNull();
    });

    it('covers all members of AUTOPILOT_SUCCESS_INTENTS', () => {
      for (const intent of AUTOPILOT_SUCCESS_INTENTS) {
        expect(autopilotSuccessOutcome(intent)).not.toBeNull();
      }
    });
  });

  describe('classifyToolCategory', () => {
    it.each([
      ['create_product_v2', 'product'],
      ['update_plan', 'plan'],
      ['delete_checkout', 'checkout'],
      ['update_coupon', 'coupon'],
      ['generate_pix_request', 'payment'],
      ['generate_boleto', 'payment'],
      ['create_payment_intent', 'payment'],
      ['create_order_v1', 'sale'],
      ['list_orders', 'sale'],
      ['get_wallet_balance', 'wallet'],
      ['request_withdrawal', 'wallet'],
      ['request_anticipation', 'wallet'],
      ['search_agent_v2', 'crm'],
      ['list_leads', 'crm'],
      ['git_diff', 'code'],
      ['code_outline', 'code'],
      ['codegraph_query', 'code'],
      ['search_codebase_v1', 'code'],
      ['get_settings_v2', 'config'],
      ['update_fiscal', 'config'],
      ['toggle_theme', 'config'],
      ['configure_affiliate', 'marketing'],
      ['update_affiliate_link', 'marketing'],
      ['browse_marketplace_v1', 'marketing'],
      ['get_sales_dashboard', 'analytics'],
      ['get_analytics_summary', 'analytics'],
      ['get_nps_score', 'analytics'],
      ['get_churn_metrics', 'analytics'],
      ['get_abandon_rate', 'analytics'],
      ['add_url', 'url'],
      ['update_url', 'url'],
      ['delete_url', 'url'],
      ['get_product_urls', 'url'],
      ['list_subscriptions', 'operations'],
      ['get_product_reviews', 'operations'],
    ])('classifies %s as %s', (toolName, expected) => {
      expect(classifyToolCategory(toolName)).toBe(expected);
    });

    it("returns 'generic' for unknown tool names", () => {
      expect(classifyToolCategory('totally_unknown_tool')).toBe('generic');
      expect(classifyToolCategory('')).toBe('generic');
    });

    it('treats prefix matches greedily (no fuzzy match)', () => {
      expect(classifyToolCategory('create_pr')).toBe('generic');
      expect(classifyToolCategory('create_product')).toBe('product');
    });
  });

  describe('outcomeFromPayload', () => {
    it('returns 0 when payload.outcome === 0', () => {
      const event = baseEvent({ payload: { outcome: 0 } });
      expect(outcomeFromPayload(event)).toBe(0);
    });

    it('returns 0 when payload.outcome === false', () => {
      const event = baseEvent({ payload: { outcome: false } });
      expect(outcomeFromPayload(event)).toBe(0);
    });

    it.each(['failed', 'cancelled', 'canceled', 'lost', 'unresolved'])(
      'returns 0 for status %s (case-insensitive)',
      (status) => {
        const event = baseEvent({ payload: { status } });
        expect(outcomeFromPayload(event)).toBe(0);
      },
    );

    it('lowercases the status before comparing', () => {
      const event = baseEvent({ payload: { status: 'FAILED' } });
      expect(outcomeFromPayload(event)).toBe(0);
    });

    it('defaults to 1 (success) for unknown status', () => {
      const event = baseEvent({ payload: { status: 'won' } });
      expect(outcomeFromPayload(event)).toBe(1);
    });

    it('defaults to 1 for empty payload', () => {
      const event = baseEvent({ payload: {} });
      expect(outcomeFromPayload(event)).toBe(1);
    });

    it('still inspects status when outcome is truthy (status wins for failed)', () => {
      const event = baseEvent({ payload: { outcome: 1, status: 'failed' } });
      // outcome=1 does NOT short-circuit; status='failed' still maps to 0
      expect(outcomeFromPayload(event)).toBe(0);
    });

    it('returns 1 when outcome=1 and status is also positive', () => {
      const event = baseEvent({ payload: { outcome: 1, status: 'won' } });
      expect(outcomeFromPayload(event)).toBe(1);
    });
  });

  describe('exported constants', () => {
    it('exposes CONVERSION_CLOSED_STATUSES with documented members', () => {
      for (const status of ['CANCELED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED']) {
        expect(CONVERSION_CLOSED_STATUSES.has(status)).toBe(true);
      }
    });

    it('exposes AUTOPILOT_SUCCESS_INTENTS with documented members', () => {
      for (const intent of ['lead_qualified', 'meeting_booked', 'purchase_intent']) {
        expect(AUTOPILOT_SUCCESS_INTENTS.has(intent)).toBe(true);
      }
    });
  });
});
