import type { SpineEventRef } from '../mind/mind.types';
import { ExpansionFitDetector } from './expansion-fit.detector';
import { makeEventFactory } from '../../../test/helpers/spine-event-factory';
import { baseInput } from '../../../test/helpers/detection-input-factory';

const makeEvent = makeEventFactory();

describe('POSTSALE-008 — Expansion Fit Detector', () => {
  let svc: ExpansionFitDetector;

  beforeEach(() => {
    svc = new ExpansionFitDetector();
  });

  test('no expansion fit without payment', () => {
    const result = svc.assess(baseInput([], 'wks_001'));
    expect(result.expansionReady).toBe(false);
    expect(result.fitScore).toBe(0);
  });

  test('expansion ready with feature adoption and volume growth', () => {
    const now = Date.now();
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(
          'commerce.member_area.progressed',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
        ),
      );
    }
    for (let i = 0; i < 2; i++) {
      events.push(
        makeEvent(
          'commerce.payment.approved',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
        ),
      );
    }
    events.push(
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { payload: { sentimentLabel: 'positive' } },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
    );
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.expansionReady).toBe(true);
    expect(result.signals).toContain('feature_adoption');
    expect(result.signals).toContain('volume_growth');
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
    expect(result.control.leadOutcomeGuardrail).toContain('never use urgency');
  });

  test('blocks expansion when usage and payments exist but no first value or satisfaction proof exists', () => {
    const now = Date.now();
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(
          'commerce.member_area.progressed',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
        ),
      );
    }
    for (let i = 0; i < 2; i++) {
      events.push(
        makeEvent(
          'commerce.payment.approved',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
        ),
      );
    }
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.fitScore).toBeGreaterThanOrEqual(0.5);
    expect(result.expansionReady).toBe(false);
    expect(result.suggestedExpansionOffer).toBeUndefined();
    expect(result.control.delegationMode).toBe('silent_monitoring');
    expect(result.control.safeNextStep).toContain('Keep expansion closed');
  });

  test('does not use another customer satisfaction to suggest expansion', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(
          'commerce.member_area.progressed',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
          { entityRef: target },
        ),
      );
    }
    for (let i = 0; i < 2; i++) {
      events.push(
        makeEvent(
          'commerce.payment.approved',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
          { entityRef: target },
        ),
      );
    }
    events.push(
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other, payload: { sentimentLabel: 'positive' } },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other },
      ),
    );
    const result = svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: target });
    expect(result.fitScore).toBeGreaterThanOrEqual(0.5);
    expect(result.expansionReady).toBe(false);
    expect(result.suggestedExpansionOffer).toBeUndefined();
  });

  test('suggests premium plan for high fit', () => {
    const now = Date.now();
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(
          'commerce.member_area.progressed',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
        ),
      );
    }
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(
          'commerce.payment.approved',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
        ),
      );
    }
    for (let i = 0; i < 2; i++) {
      events.push(
        makeEvent(
          'commerce.crm.deal_won',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
        ),
      );
    }
    events.push(
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { payload: { sentimentLabel: 'positive' } },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
    );
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.suggestedExpansionOffer).toBe('premium_plan');
  });

  test('blocks expansion offer for a recently recovered objection buyer', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const events: SpineEventRef[] = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 14 * 86400_000).toISOString(),
        { entityRef: target },
      ),
    ];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(
          'commerce.member_area.progressed',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
          { entityRef: target },
        ),
      );
    }
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent(
          'commerce.payment.approved',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
          { entityRef: target },
        ),
      );
    }
    for (let i = 0; i < 2; i++) {
      events.push(
        makeEvent(
          'commerce.crm.deal_won',
          'wks_001',
          new Date(now - (i + 1) * 86400_000).toISOString(),
          { entityRef: target },
        ),
      );
    }
    events.push(
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: target, payload: { sentimentLabel: 'positive' } },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: target },
      ),
    );
    const result = svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: target });
    expect(result.fitScore).toBeGreaterThanOrEqual(0.7);
    expect(result.expansionReady).toBe(false);
    expect(result.suggestedExpansionOffer).toBeUndefined();
  });
});
