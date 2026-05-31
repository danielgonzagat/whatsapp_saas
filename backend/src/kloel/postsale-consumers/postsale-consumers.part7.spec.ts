import { SpineEmitterService } from '../spine/spine-emitter.service';
import { makeSpine } from '../../../test/helpers/spine-factory';
import { RepurchaseWindowDetector } from './repurchase-window.detector';
import { makeEventFactory } from '../../../test/helpers/spine-event-factory';
import { baseInput } from '../../../test/helpers/detection-input-factory';

const makeEvent = makeEventFactory();

describe('POSTSALE-007 — Repurchase Window Detector', () => {
  let spine: SpineEmitterService;
  let svc: RepurchaseWindowDetector;

  beforeEach(() => {
    spine = makeSpine();
    svc = new RepurchaseWindowDetector(spine);
  });

  test('window not open without payment', async () => {
    const result = await svc.detect(baseInput([], 'wks_001'));
    expect(result.windowOpen).toBe(false);
    expect(result.control.delegationMode).toBe('silent_monitoring');
    expect(result.control.safeNextStep).toContain('Keep the repurchase window closed');
  });

  test('window open with mature payment + satisfaction + progress', async () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 30 * 86400_000).toISOString(),
      ),
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
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 7200_000).toISOString(),
      ),
    ];
    const result = await svc.detect(baseInput(events, 'wks_001', now));
    expect(result.windowOpen).toBe(true);
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
    expect(result.control.leadOutcomeGuardrail).toContain('not urgency or pressure');
  });

  test('emits repurchase_window_opened on spine when window opens', async () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 30 * 86400_000).toISOString(),
      ),
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
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 7200_000).toISOString(),
      ),
    ];
    await svc.detect(baseInput(events, 'wks_001', now));
    const windowEvents = spine
      .recentEvents()
      .filter((e) => e.eventName === 'commerce.post_sale.repurchase_window_opened');
    expect(windowEvents.length).toBeGreaterThan(0);
  });

  test('does not use another customer evidence to open repurchase window', async () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 30 * 86400_000).toISOString(),
        { entityRef: target },
      ),
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
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 7200_000).toISOString(),
        { entityRef: other },
      ),
    ];

    const result = await svc.detect({ ...baseInput(events, 'wks_001', now), entityRef: target });

    expect(result.windowOpen).toBe(false);
    expect(result.signals).toContain('missing_first_value_guardrail');
    expect(result.signals).toContain('missing_positive_satisfaction_guardrail');
    expect(result.control.leadOutcomeGuardrail).toContain('cross-customer');
    expect(spine.recentEvents()).toHaveLength(0);
  });

  test('does not open repurchase window for a recently recovered objection buyer', async () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 20 * 86400_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 30 * 86400_000).toISOString(),
        { entityRef: target },
      ),
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
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 7200_000).toISOString(),
        { entityRef: target },
      ),
    ];

    const result = await svc.detect({ ...baseInput(events, 'wks_001', now), entityRef: target });

    expect(result.windowScore).toBeGreaterThanOrEqual(0.5);
    expect(result.windowOpen).toBe(false);
    expect(result.signals).toContain('recent_objection_guardrail');
    expect(result.control.uncertainty).toContain('recent objection recovery');
    expect(result.control.rollback).toContain('cancel it');
    expect(spine.recentEvents()).toHaveLength(0);
  });
});
