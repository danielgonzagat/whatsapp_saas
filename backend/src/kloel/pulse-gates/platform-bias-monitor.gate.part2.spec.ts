import {
  makePlatformBiasMonitorGate,
  PlatformBiasMonitorInput,
  RecommendationEntry,
} from './platform-bias-monitor.gate';

function rec(
  overrides: Partial<RecommendationEntry> & { recommendationId: string },
): RecommendationEntry {
  return {
    productId: overrides.productId ?? `prod-${overrides.recommendationId}`,
    productSource: overrides.productSource ?? 'external',
    qualityScore: overrides.qualityScore ?? 0.7,
    weight: overrides.weight ?? 1,
    internalRevenue: overrides.internalRevenue ?? 0,
    hasCommercialLink: overrides.hasCommercialLink ?? false,
    commercialLinkDisclosed: overrides.commercialLinkDisclosed ?? false,
    ...overrides,
  };
}

function input(
  recs: RecommendationEntry[],
  overrides?: Partial<PlatformBiasMonitorInput>,
): PlatformBiasMonitorInput {
  return { recommendations: recs, ...overrides };
}

describe('platform-bias-monitor gate', () => {
  // ──────────────────────────────
  // Group 1 — Basic PASS scenarios
  // ──────────────────────────────

  it('15: FAIL — multiple disclosure violations across products', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productId: 'partner-alpha',
        productSource: 'internal',
        hasCommercialLink: true,
        commercialLinkDisclosed: false,
        weight: 10,
      }),
      rec({
        recommendationId: 'r2',
        productId: 'partner-beta',
        productSource: 'external',
        hasCommercialLink: true,
        commercialLinkDisclosed: false,
        weight: 9,
      }),
      rec({
        recommendationId: 'r3',
        productId: 'partner-gamma',
        productSource: 'internal',
        hasCommercialLink: true,
        commercialLinkDisclosed: false,
        weight: 11,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.length).toBeGreaterThanOrEqual(3);
    for (const e of v.evidence!) {
      if (e.detail?.includes('commercial link')) {
        expect(e.detail).toMatch(/not disclosed/);
      }
    }
  });

  it('16: FAIL — disclosure violation with internal product having commercial link', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productId: 'kloel-addon',
        productSource: 'internal',
        hasCommercialLink: true,
        commercialLinkDisclosed: false,
        weight: 5,
      }),
      rec({
        recommendationId: 'r2',
        productSource: 'external',
        hasCommercialLink: false,
        commercialLinkDisclosed: false,
        weight: 5,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/kloel-addon/);
  });

  // ──────────────────────────────
  // Group 5 — Compound failures
  // ──────────────────────────────

  it('17: FAIL — compound: both weight bias and disclosure violations', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productSource: 'internal',
        weight: 100,
        hasCommercialLink: true,
        commercialLinkDisclosed: false,
      }),
      rec({
        recommendationId: 'r2',
        productSource: 'internal',
        weight: 98,
        hasCommercialLink: true,
        commercialLinkDisclosed: true,
      }),
      rec({
        recommendationId: 'r3',
        productSource: 'internal',
        weight: 102,
        hasCommercialLink: false,
        commercialLinkDisclosed: false,
      }),
      rec({
        recommendationId: 'r4',
        productSource: 'external',
        weight: 10,
        hasCommercialLink: false,
        commercialLinkDisclosed: false,
      }),
      rec({
        recommendationId: 'r5',
        productSource: 'external',
        weight: 9,
        hasCommercialLink: false,
        commercialLinkDisclosed: false,
      }),
      rec({
        recommendationId: 'r6',
        productSource: 'external',
        weight: 11,
        hasCommercialLink: true,
        commercialLinkDisclosed: false,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.length).toBeGreaterThanOrEqual(3);
    expect(v.reason!).toMatch(/\d+ platform bias violation/);
  });

  // ──────────────────────────────
  // Group 6 — Mode enforcement
  // ──────────────────────────────

  it('18: default mode is log_only', () => {
    const gate = makePlatformBiasMonitorGate();
    expect(gate.mode).toBe('log_only');
  });

  it('19: explicit hard_fail mode is respected on PASS', () => {
    const gate = makePlatformBiasMonitorGate('hard_fail');
    expect(gate.mode).toBe('hard_fail');
    const recs = [
      rec({ recommendationId: 'r1', weight: 10 }),
      rec({ recommendationId: 'r2', weight: 10 }),
      rec({ recommendationId: 'r3', weight: 10 }),
    ];
    const v = gate.check(input(recs));
    expect(v.status).toBe('PASS');
    expect(v.mode).toBe('hard_fail');
  });

  it('20: explicit log_only mode carries through to FAIL verdict', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productSource: 'internal',
        hasCommercialLink: true,
        commercialLinkDisclosed: false,
        weight: 10,
      }),
      rec({
        recommendationId: 'r2',
        productSource: 'external',
        weight: 10,
      }),
      rec({
        recommendationId: 'r3',
        productSource: 'external',
        weight: 10,
      }),
    ];
    const v = makePlatformBiasMonitorGate('log_only').check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('log_only');
  });

  it('21: hard_fail FAIL verdict carries hard_fail mode', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productSource: 'internal',
        hasCommercialLink: true,
        commercialLinkDisclosed: false,
        weight: 10,
      }),
      rec({
        recommendationId: 'r2',
        productSource: 'external',
        weight: 10,
      }),
    ];
    const v = makePlatformBiasMonitorGate('hard_fail').check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
  });

  // ──────────────────────────────
  // Group 7 — Edge cases and thresholds
  // ──────────────────────────────

  it('22: FAIL — custom weight margin threshold triggers on smaller gap', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 12, qualityScore: 0.8 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 11, qualityScore: 0.8 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 12, qualityScore: 0.8 }),
      rec({ recommendationId: 'r4', productSource: 'external', weight: 10, qualityScore: 0.8 }),
      rec({ recommendationId: 'r5', productSource: 'external', weight: 9, qualityScore: 0.8 }),
      rec({ recommendationId: 'r6', productSource: 'external', weight: 10, qualityScore: 0.8 }),
    ];
    const v = makePlatformBiasMonitorGate().check(
      input(recs, { weightMarginThreshold: 0.1 }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/statistically significant weight bias/);
  });

  it('23: PASS — custom significance threshold avoids false positive on noisy data', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 100, qualityScore: 0.92 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 5, qualityScore: 0.91 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 5, qualityScore: 0.93 }),
      rec({ recommendationId: 'r4', productSource: 'external', weight: 10, qualityScore: 0.7 }),
      rec({ recommendationId: 'r5', productSource: 'external', weight: 9, qualityScore: 0.71 }),
      rec({ recommendationId: 'r6', productSource: 'external', weight: 10, qualityScore: 0.69 }),
    ];
    const v = makePlatformBiasMonitorGate().check(
      input(recs, { significanceThreshold: 0.001 }),
    );
    expect(v.status).toBe('PASS');
  });

  it('24: PASS — quality-adjusted check passes when external better quality gets higher weight', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productId: 'kloel-pro',
        productSource: 'internal',
        qualityScore: 0.5,
        weight: 5,
      }),
      rec({
        recommendationId: 'r2',
        productId: 'ext-premium',
        productSource: 'external',
        qualityScore: 0.9,
        weight: 100,
      }),
      rec({
        recommendationId: 'r3',
        productId: 'ext-plus',
        productSource: 'external',
        qualityScore: 0.88,
        weight: 95,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('25: PASS — zero-weight internal recommendations cannot produce bias', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 0 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 0 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 0 }),
      rec({ recommendationId: 'r4', productSource: 'external', weight: 10 }),
      rec({ recommendationId: 'r5', productSource: 'external', weight: 10 }),
      rec({ recommendationId: 'r6', productSource: 'external', weight: 10 }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('26: PASS — custom minSampleSize delays detection until enough data', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 100 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 100 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 100 }),
      rec({ recommendationId: 'r4', productSource: 'internal', weight: 100 }),
      rec({ recommendationId: 'r5', productSource: 'external', weight: 1 }),
      rec({ recommendationId: 'r6', productSource: 'external', weight: 1 }),
      rec({ recommendationId: 'r7', productSource: 'external', weight: 1 }),
      rec({ recommendationId: 'r8', productSource: 'external', weight: 1 }),
      rec({ recommendationId: 'r9', productSource: 'external', weight: 1 }),
    ];
    const v = makePlatformBiasMonitorGate().check(
      input(recs, { minSampleSize: 5 }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.some((e) => e.detail?.includes('systematically boosted'))).toBe(true);
  });

  it('27: gate name is platform-bias-monitor', () => {
    const gate = makePlatformBiasMonitorGate();
    expect(gate.name).toBe('platform-bias-monitor');
  });

  it('28: PASS — recommendations with only quality-adjusted bias needs min sample in both groups to trigger weight check', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productId: 'kloel-pro',
        productSource: 'internal',
        qualityScore: 0.8,
        weight: 100,
      }),
      rec({
        recommendationId: 'r2',
        productId: 'ext-x',
        productSource: 'external',
        qualityScore: 0.81,
        weight: 10,
      }),
      rec({
        recommendationId: 'r3',
        productId: 'ext-y',
        productSource: 'external',
        qualityScore: 0.79,
        weight: 12,
      }),
      rec({
        recommendationId: 'r4',
        productId: 'ext-z',
        productSource: 'external',
        qualityScore: 0.8,
        weight: 11,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.some((e) => e.detail?.includes('systematically boosted'))).toBe(true);
  });
});
