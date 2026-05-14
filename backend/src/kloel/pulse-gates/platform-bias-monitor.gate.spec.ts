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

  it('1: PASS — empty recommendations array', () => {
    const v = makePlatformBiasMonitorGate().check(input([]));
    expect(v.status).toBe('PASS');
  });

  it('2: PASS — balanced weights, internal and external means are close', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 10 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 11 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 9 }),
      rec({ recommendationId: 'r4', productSource: 'external', weight: 10 }),
      rec({ recommendationId: 'r5', productSource: 'external', weight: 9 }),
      rec({ recommendationId: 'r6', productSource: 'external', weight: 11 }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('3: PASS — external products weighted higher than internal', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 5 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 6 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 4 }),
      rec({ recommendationId: 'r4', productSource: 'external', weight: 10 }),
      rec({ recommendationId: 'r5', productSource: 'external', weight: 11 }),
      rec({ recommendationId: 'r6', productSource: 'external', weight: 9 }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('4: PASS — internal slightly higher but within weight margin threshold', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 11 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 10 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 11 }),
      rec({ recommendationId: 'r4', productSource: 'external', weight: 10 }),
      rec({ recommendationId: 'r5', productSource: 'external', weight: 9 }),
      rec({ recommendationId: 'r6', productSource: 'external', weight: 10 }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('5: PASS — insufficient sample size below minSampleSize', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 100 }),
      rec({ recommendationId: 'r2', productSource: 'external', weight: 1 }),
      rec({ recommendationId: 'r3', productSource: 'external', weight: 1 }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('6: PASS — no commercial links exist at all', () => {
    const recs = [
      rec({ recommendationId: 'r1', hasCommercialLink: false, commercialLinkDisclosed: false }),
      rec({ recommendationId: 'r2', hasCommercialLink: false, commercialLinkDisclosed: false }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('7: PASS — all commercial links properly disclosed', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productSource: 'internal',
        hasCommercialLink: true,
        commercialLinkDisclosed: true,
        weight: 10,
      }),
      rec({
        recommendationId: 'r2',
        productSource: 'external',
        hasCommercialLink: true,
        commercialLinkDisclosed: true,
        weight: 10,
      }),
      rec({
        recommendationId: 'r3',
        productSource: 'external',
        hasCommercialLink: false,
        commercialLinkDisclosed: false,
        weight: 10,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('8: PASS — no internal products, all external', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'external', weight: 10 }),
      rec({ recommendationId: 'r2', productSource: 'external', weight: 9 }),
      rec({ recommendationId: 'r3', productSource: 'external', weight: 11 }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  it('9: PASS — no external products, all internal (cannot compare)', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 10 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 9 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 11 }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('PASS');
  });

  // ──────────────────────────────
  // Group 2 — Weight bias FAIL
  // ──────────────────────────────

  it('10: FAIL — internal revenue group has significantly higher mean weight', () => {
    const recs = [
      rec({ recommendationId: 'r1', productSource: 'internal', weight: 100 }),
      rec({ recommendationId: 'r2', productSource: 'internal', weight: 98 }),
      rec({ recommendationId: 'r3', productSource: 'internal', weight: 102 }),
      rec({ recommendationId: 'r4', productSource: 'external', weight: 10 }),
      rec({ recommendationId: 'r5', productSource: 'external', weight: 9 }),
      rec({ recommendationId: 'r6', productSource: 'external', weight: 11 }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.reason!).toMatch(/platform bias violation/);
    expect(v.evidence![0]!.detail).toMatch(/statistically significant weight bias/);
    expect(v.evidence![0]!.detail).toMatch(/internal mean=100\.0000/);
  });

  it('11: FAIL — large sample weight bias with tight variance', () => {
    const recs: RecommendationEntry[] = [];
    for (let i = 0; i < 20; i++) {
      recs.push(
        rec({
          recommendationId: `int-${i}`,
          productSource: 'internal',
          weight: 50 + i * 0.1,
        }),
      );
    }
    for (let i = 0; i < 20; i++) {
      recs.push(
        rec({
          recommendationId: `ext-${i}`,
          productSource: 'external',
          weight: 10 + i * 0.1,
        }),
      );
    }
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/statistically significant weight bias/);
  });

  // ──────────────────────────────
  // Group 3 — Quality-adjusted bias FAIL
  // ──────────────────────────────

  it('12: FAIL — platform product boosted vs external with equivalent quality', () => {
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
        productId: 'competitor-x',
        productSource: 'external',
        qualityScore: 0.8,
        weight: 10,
      }),
      rec({
        recommendationId: 'r3',
        productId: 'competitor-y',
        productSource: 'external',
        qualityScore: 0.79,
        weight: 12,
      }),
      rec({
        recommendationId: 'r3b',
        productId: 'competitor-z',
        productSource: 'external',
        qualityScore: 0.81,
        weight: 11,
      }),
      rec({
        recommendationId: 'r4',
        productId: 'kloel-lite',
        productSource: 'internal',
        qualityScore: 0.5,
        weight: 5,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.some((e) => e.detail?.includes('systematically boosted'))).toBe(true);
  });

  it('13: FAIL — multiple platform products boosted across quality bands', () => {
    const recs = [
      rec({
        recommendationId: 'r1',
        productId: 'kloel-pro',
        productSource: 'internal',
        qualityScore: 0.9,
        weight: 200,
      }),
      rec({
        recommendationId: 'r2',
        productId: 'ext-a',
        productSource: 'external',
        qualityScore: 0.91,
        weight: 20,
      }),
      rec({
        recommendationId: 'r2b',
        productId: 'ext-a2',
        productSource: 'external',
        qualityScore: 0.89,
        weight: 18,
      }),
      rec({
        recommendationId: 'r2c',
        productId: 'ext-a3',
        productSource: 'external',
        qualityScore: 0.92,
        weight: 22,
      }),
      rec({
        recommendationId: 'r3',
        productId: 'kloel-basic',
        productSource: 'internal',
        qualityScore: 0.5,
        weight: 100,
      }),
      rec({
        recommendationId: 'r4',
        productId: 'ext-b',
        productSource: 'external',
        qualityScore: 0.5,
        weight: 10,
      }),
      rec({
        recommendationId: 'r4b',
        productId: 'ext-b2',
        productSource: 'external',
        qualityScore: 0.51,
        weight: 11,
      }),
      rec({
        recommendationId: 'r5',
        productId: 'ext-c',
        productSource: 'external',
        qualityScore: 0.49,
        weight: 9,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    const boostedDetails = v.evidence!.filter((e) =>
      e.detail?.includes('systematically boosted'),
    );
    expect(boostedDetails.length).toBe(1);
    expect(boostedDetails[0]!.detail!).toMatch(/2 platform product/);
  });

  // ──────────────────────────────
  // Group 4 — Disclosure violation FAIL
  // ──────────────────────────────

  it('14: FAIL — commercial link not disclosed on single recommendation', () => {
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
        hasCommercialLink: false,
        commercialLinkDisclosed: false,
        weight: 10,
      }),
      rec({
        recommendationId: 'r3',
        productSource: 'external',
        hasCommercialLink: false,
        commercialLinkDisclosed: false,
        weight: 10,
      }),
    ];
    const v = makePlatformBiasMonitorGate().check(input(recs));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/commercial link.*not disclosed/);
    expect(v.evidence![0]!.detail).toMatch(/recommendationId=r1/);
  });

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
        expect(e.detail!).toMatch(/not disclosed/);
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
