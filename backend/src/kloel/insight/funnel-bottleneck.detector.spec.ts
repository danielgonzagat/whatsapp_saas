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
  it('01 — returns no_data for empty events list', () => {
    const result = detectFunnelBottleneck({
      events: [],
      workspaceId: WKS,
      nowMs: NOW,
    });
    expect(result.bottleneckStep).toBe('no_data');
    expect(result.dropRate).toBe(0);
    expect(result.eventCount).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('02 — returns no_data when workspace has zero matching events', () => {
    const events = [ev({ eventName: 'commerce.lead.qualified', workspaceId: 'other_wks' })];
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });
    expect(result.bottleneckStep).toBe('no_data');
    expect(result.eventCount).toBe(0);
  });

  it('03 — detects bottleneck at lead.created→contacted when no contacts happen', () => {
    const events = repeat('commerce.lead.created', 100);
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    assertResult(result, {
      workspaceId: WKS,
      bottleneckStep: 'commerce.lead.contacted',
      dropRate: 1,
      eventCount: 100,
    });
    expect(result.suggestedAction).toContain('outreach');
    expect(result.financialImpactEstimateCents).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('04 — detects bottleneck at contacted→replied', () => {
    const events = [
      ...repeat('commerce.lead.created', 100),
      ...repeat('commerce.lead.contacted', 90),
      ...repeat('commerce.lead.replied', 30),
      ...repeat('commerce.lead.qualified', 25),
      ...repeat('commerce.cart.created', 20),
      ...repeat('commerce.cart.checkout_initiated', 16),
      ...repeat('commerce.payment.approved', 14),
    ];
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    assertResult(result, {
      bottleneckStep: 'commerce.lead.replied',
      dropRate: 2 / 3,
      eventCount: 295,
    });
    expect(result.suggestedAction).toContain('first-contact message');
  });

  it('05 — detects bottleneck at replied→qualified', () => {
    const events = [
      ...repeat('commerce.lead.created', 80),
      ...repeat('commerce.lead.contacted', 70),
      ...repeat('commerce.lead.replied', 60),
      ...repeat('commerce.lead.qualified', 10),
      ...repeat('commerce.cart.created', 8),
      ...repeat('commerce.cart.checkout_initiated', 7),
      ...repeat('commerce.payment.approved', 6),
    ];
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    assertResult(result, {
      bottleneckStep: 'commerce.lead.qualified',
      dropRate: (60 - 10) / 60,
      eventCount: 241,
    });
    expect(result.suggestedAction).toContain('qualification');
  });

  it('06 — detects bottleneck at qualified→cart.created', () => {
    const events = [
      ...repeat('commerce.lead.created', 200),
      ...repeat('commerce.lead.contacted', 180),
      ...repeat('commerce.lead.replied', 160),
      ...repeat('commerce.lead.qualified', 120),
      ...repeat('commerce.cart.created', 30),
      ...repeat('commerce.cart.checkout_initiated', 25),
      ...repeat('commerce.payment.approved', 20),
    ];
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    assertResult(result, {
      bottleneckStep: 'commerce.cart.created',
      dropRate: (120 - 30) / 120,
      eventCount: 735,
    });
    expect(result.suggestedAction).toContain('product presentation');
  });

  it('07 — detects bottleneck at cart.created→checkout_initiated', () => {
    const events = [
      ...repeat('commerce.lead.created', 100),
      ...repeat('commerce.lead.contacted', 90),
      ...repeat('commerce.lead.replied', 80),
      ...repeat('commerce.lead.qualified', 50),
      ...repeat('commerce.cart.created', 45),
      ...repeat('commerce.cart.checkout_initiated', 5),
      ...repeat('commerce.payment.approved', 4),
    ];
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    assertResult(result, {
      bottleneckStep: 'commerce.cart.checkout_initiated',
      dropRate: (45 - 5) / 45,
      eventCount: 374,
    });
    expect(result.suggestedAction).toContain('checkout');
  });

  it('08 — detects bottleneck at checkout_initiated→payment.approved', () => {
    const events = [
      ...repeat('commerce.lead.created', 50),
      ...repeat('commerce.lead.contacted', 45),
      ...repeat('commerce.lead.replied', 40),
      ...repeat('commerce.lead.qualified', 30),
      ...repeat('commerce.cart.created', 25),
      ...repeat('commerce.cart.checkout_initiated', 20),
      ...repeat('commerce.payment.approved', 5),
    ];
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    assertResult(result, {
      bottleneckStep: 'commerce.payment.approved',
      dropRate: (20 - 5) / 20,
      eventCount: 215,
    });
    expect(result.suggestedAction).toContain('payment');
  });

  it('09 — perfect funnel with zero drop across all steps', () => {
    const events = [
      ...repeat('commerce.lead.created', 50),
      ...repeat('commerce.lead.contacted', 50),
      ...repeat('commerce.lead.replied', 50),
      ...repeat('commerce.lead.qualified', 50),
      ...repeat('commerce.cart.created', 50),
      ...repeat('commerce.cart.checkout_initiated', 50),
      ...repeat('commerce.payment.approved', 50),
    ];
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(result.dropRate).toBe(0);
    expect(result.eventCount).toBe(350);
    expect(result.bottleneckStep).not.toBe('no_data');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('10 — excludes events outside time window', () => {
    const inWindow = [
      ...repeat('commerce.lead.created', 20),
      ...repeat('commerce.lead.contacted', 10),
      ...repeat('commerce.lead.replied', 8),
      ...repeat('commerce.lead.qualified', 7),
      ...repeat('commerce.cart.created', 6),
      ...repeat('commerce.cart.checkout_initiated', 5),
      ...repeat('commerce.payment.approved', 4),
    ];

    const outOfWindow = ev({
      eventName: 'commerce.lead.replied',
      occurredAt: '2025-01-01T00:00:00.000Z',
    });

    const result = detectFunnelBottleneck({
      events: [...inWindow, outOfWindow],
      workspaceId: WKS,
      nowMs: NOW,
      windowDays: 30,
    });

    expect(result.eventCount).toBe(60);
    expect(result.bottleneckStep).toBe('commerce.lead.contacted');
    expect(result.dropRate).toBeCloseTo(0.5, 2);
  });

  it('11 — multiple workspaces, only target workspace counted', () => {
    const events = [
      ...repeat('commerce.lead.created', 100),
      ...repeat('commerce.lead.contacted', 80),
      ...repeat('commerce.lead.replied', 75),
      ...repeat('commerce.lead.qualified', 70),
      ...repeat('commerce.cart.created', 65),
      ...repeat('commerce.cart.checkout_initiated', 60),
      ...repeat('commerce.payment.approved', 55),
      ev({ eventName: 'commerce.lead.created', workspaceId: 'other_01' }),
      ev({ eventName: 'commerce.lead.replied', workspaceId: 'other_02' }),
      ev({ eventName: 'commerce.payment.approved', workspaceId: 'other_03' }),
    ];

    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(result.eventCount).toBe(505);
    expect(result.bottleneckStep).toBe('commerce.lead.contacted');
  });

  it('12 — 100% drop at first stage', () => {
    const events = [...repeat('commerce.lead.created', 1000)];
    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    assertResult(result, {
      bottleneckStep: 'commerce.lead.contacted',
      dropRate: 1,
      eventCount: 1000,
    });
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.financialImpactEstimateCents).toBeGreaterThan(50000);
  });

  it('13 — low event count yields low confidence', () => {
    const events = [
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.created' }),
      ev({ eventName: 'commerce.lead.contacted' }),
    ];

    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(result.eventCount).toBe(3);
    expect(result.bottleneckStep).not.toBe('no_data');
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  it('14 — mixed event types, only funnel-relevant counted', () => {
    const events = [
      ...repeat('commerce.lead.created', 50),
      ...repeat('commerce.lead.contacted', 48),
      ...repeat('commerce.lead.replied', 20),
      ...repeat('commerce.lead.qualified', 18),
      ...repeat('commerce.cart.created', 16),
      ...repeat('commerce.cart.checkout_initiated', 14),
      ...repeat('commerce.payment.approved', 12),
      ev({ eventName: 'commerce.crm.stage_changed' }),
      ev({ eventName: 'commerce.whatsapp.message_received' }),
      ev({ eventName: 'commerce.payment.declined' }),
      ev({ eventName: 'commerce.campaign.clicked' }),
    ];

    const result = detectFunnelBottleneck({
      events,
      workspaceId: WKS,
      nowMs: NOW,
    });

    expect(result.eventCount).toBe(178);
    expect(result.bottleneckStep).toBe('commerce.lead.replied');
  });

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
