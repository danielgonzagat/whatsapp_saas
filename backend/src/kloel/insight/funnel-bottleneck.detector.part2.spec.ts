import type { SpineEventRef } from '../mind/mind.types';
import type { FunnelBottleneckResult } from './insight.types';
import { detectFunnelBottleneck } from './funnel-bottleneck.detector';

const WKS = 'wks_fb_spec';
const NOW = Date.parse('2026-05-14T12:00:00.000Z');

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  return {
    eventId: over?.eventId ?? `ev_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over?.eventName ?? 'commerce.lead.created',
    workspaceId: over?.workspaceId ?? WKS,
    occurredAt: over?.occurredAt ?? '2026-05-01T00:00:00.000Z',
    truthMode: over?.truthMode ?? 'observed',
    ...(over?.entityRef !== undefined ? { entityRef: over.entityRef } : {}),
    ...(over?.valence !== undefined ? { valence: over.valence } : {}),
    ...(over?.payload !== undefined ? { payload: over.payload } : {}),
    ...(over?.correlationId !== undefined ? { correlationId: over.correlationId } : {}),
  };
}

function assertResult(
  result: FunnelBottleneckResult,
  expected: Partial<FunnelBottleneckResult>,
): void {
  if (expected.workspaceId !== undefined) {
    expect(result.workspaceId).toBe(expected.workspaceId);
  }
  if (expected.bottleneckStep !== undefined) {
    expect(result.bottleneckStep).toBe(expected.bottleneckStep);
  }
  if (expected.dropRate !== undefined) {
    expect(result.dropRate).toBeCloseTo(expected.dropRate, 3);
  }
  if (expected.eventCount !== undefined) {
    expect(result.eventCount).toBe(expected.eventCount);
  }
  if (expected.confidence !== undefined) {
    expect(result.confidence).toBeCloseTo(expected.confidence, 1);
  }
  if (expected.financialImpactEstimateCents !== undefined) {
    expect(result.financialImpactEstimateCents).toBeGreaterThanOrEqual(
      expected.financialImpactEstimateCents,
    );
  }
}

function repeat(eventName: string, count: number, baseMs?: number): SpineEventRef[] {
  const results: SpineEventRef[] = [];
  for (let i = 0; i < count; i++) {
    results.push(
      ev({
        eventName,
        occurredAt: new Date((baseMs ?? NOW) - i * 3600_000).toISOString(),
      }),
    );
  }
  return results;
}

describe('detectFunnelBottleneck', () => {
  it('15 — events with invalid occurredAt are excluded', () => {
    const valid = [...repeat('commerce.lead.created', 10), ...repeat('commerce.lead.contacted', 5)];

    const invalid = ev({
      eventName: 'commerce.lead.replied',
      occurredAt: 'not-a-date',
    });

    const result = detectFunnelBottleneck({
      events: [...valid, invalid],
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(result.eventCount).toBe(15);
  });

  it('16 — higher event volume increases confidence', () => {
    const eventsLow = repeat('commerce.lead.created', 5);
    const eventsHigh = repeat('commerce.lead.created', 500);

    const resultLow = detectFunnelBottleneck({
      events: eventsLow,
      workspaceId: WKS,
      nowMs: NOW,
    });
    const resultHigh = detectFunnelBottleneck({
      events: eventsHigh,
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(resultHigh.confidence).toBeGreaterThan(resultLow.confidence);
  });

  it('17 — financial impact is higher at deeper funnel stages', () => {
    const earlyDrop = [
      ...repeat('commerce.lead.created', 100),
      ...repeat('commerce.lead.contacted', 10),
    ];
    const lateDrop = [
      ...repeat('commerce.lead.created', 100),
      ...repeat('commerce.lead.contacted', 98),
      ...repeat('commerce.lead.replied', 96),
      ...repeat('commerce.lead.qualified', 94),
      ...repeat('commerce.cart.created', 92),
      ...repeat('commerce.cart.checkout_initiated', 90),
      ...repeat('commerce.payment.approved', 10),
    ];

    const earlyResult = detectFunnelBottleneck({
      events: earlyDrop,
      workspaceId: WKS,
      nowMs: NOW,
    });
    const lateResult = detectFunnelBottleneck({
      events: lateDrop,
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(lateResult.financialImpactEstimateCents).toBeGreaterThan(
      earlyResult.financialImpactEstimateCents,
    );
  });

  it('18 — default window of 90 days is applied', () => {
    const recent = [...repeat('commerce.lead.created', 30)];
    const old = ev({
      eventName: 'commerce.lead.contacted',
      occurredAt: new Date(NOW - 95 * 24 * 3600_000).toISOString(),
    });

    const result = detectFunnelBottleneck({
      events: [...recent, old],
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(result.eventCount).toBe(30);
  });

  it('19 — bottleneck gap clarity improves confidence', () => {
    const clearGap = [
      ...repeat('commerce.lead.created', 100),
      ...repeat('commerce.lead.contacted', 5),
      ...repeat('commerce.lead.replied', 4),
      ...repeat('commerce.lead.qualified', 3),
      ...repeat('commerce.cart.created', 2),
      ...repeat('commerce.cart.checkout_initiated', 1),
      ...repeat('commerce.payment.approved', 1),
    ];

    const uniformDrop = [
      ...repeat('commerce.lead.created', 100),
      ...repeat('commerce.lead.contacted', 85),
      ...repeat('commerce.lead.replied', 72),
      ...repeat('commerce.lead.qualified', 61),
      ...repeat('commerce.cart.created', 52),
      ...repeat('commerce.cart.checkout_initiated', 44),
      ...repeat('commerce.payment.approved', 37),
    ];

    const clearResult = detectFunnelBottleneck({
      events: clearGap,
      workspaceId: WKS,
      nowMs: NOW,
    });
    const uniformResult = detectFunnelBottleneck({
      events: uniformDrop,
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(clearResult.confidence).toBeGreaterThan(uniformResult.confidence);
  });

  it('20 — suggestedAction is relevant for each bottleneck step', () => {
    const createWithBottleneckAt = (step: string): FunnelBottleneckResult => {
      const stepOrder = [
        'commerce.lead.created',
        'commerce.lead.contacted',
        'commerce.lead.replied',
        'commerce.lead.qualified',
        'commerce.cart.created',
        'commerce.cart.checkout_initiated',
        'commerce.payment.approved',
      ];
      const idx = stepOrder.indexOf(step);

      const events: SpineEventRef[] = [];
      for (let i = 0; i < 7; i++) {
        const stepName = stepOrder[i]!;
        let count: number;
        if (i === 0) {
          count = 200;
        } else if (i === idx) {
          count = 20;
        } else if (i < idx) {
          count = 180;
        } else {
          count = i === idx + 1 ? 15 : 14;
        }
        events.push(...repeat(stepName, count));
      }
      return detectFunnelBottleneck({ events, workspaceId: WKS, nowMs: NOW });
    };

    const contacted = createWithBottleneckAt('commerce.lead.contacted');
    expect(contacted.suggestedAction).toContain('outreach');

    const replied = createWithBottleneckAt('commerce.lead.replied');
    expect(replied.suggestedAction).toContain('first-contact');

    const qualified = createWithBottleneckAt('commerce.lead.qualified');
    expect(qualified.suggestedAction).toContain('qualification');

    const cart = createWithBottleneckAt('commerce.cart.created');
    expect(cart.suggestedAction).toContain('product presentation');

    const checkout = createWithBottleneckAt('commerce.cart.checkout_initiated');
    expect(checkout.suggestedAction).toContain('checkout');

    const payment = createWithBottleneckAt('commerce.payment.approved');
    expect(payment.suggestedAction).toContain('payment');
  });

  it('21 — truthMode is always inferred', () => {
    const events = repeat('commerce.lead.created', 10);
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });
    expect(result.truthMode).toBe('inferred');
  });

  it('22 — workspaceId is preserved in output', () => {
    const customWks = 'wks_custom_12345';
    const result = detectFunnelBottleneck({
      events: [ev({ eventName: 'commerce.lead.qualified', workspaceId: customWks })],
      workspaceId: customWks,
      nowMs: NOW,
    });
    expect(result.workspaceId).toBe(customWks);
  });
});
