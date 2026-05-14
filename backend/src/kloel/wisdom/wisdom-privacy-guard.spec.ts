/**
 * Spec: WisdomPrivacyGuardService + diffPrivacyNoise
 *
 * UTP-WISDOM-002 + UTP-WISDOM-008 — exhaustive spec for
 * k-anonymity enforcement, diff-privacy noise, attribution guard,
 * opt-out respect, and full privacy audit.
 */

import { Test } from '@nestjs/testing';
import {
  WisdomPrivacyGuardService,
  diffPrivacyNoise,
  WisdomPrivacyViolationError,
} from './wisdom-privacy-guard.service';
import { WisdomOptService } from './wisdom-opt';
import type { CandidatePattern, WisdomPattern } from './wisdom.types';

function makeCandidate(overrides: Partial<CandidatePattern> = {}): CandidatePattern {
  return {
    patternId: 'pat_test',
    description: 'Conversion rate averages 50% across 5 workspaces',
    applicableConditions: ['conversion_rate > 0'],
    evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
    evidenceWorkspacesCount: 5,
    confidence: 0.8,
    signalKind: 'conversion_rate',
    aggregatedValue: 0.5,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  diffPrivacyNoise (standalone pure function)                       */
/* ------------------------------------------------------------------ */

describe('diffPrivacyNoise', () => {
  test('scenario 01 — adds non-zero noise to a value', () => {
    const original = 0.5;
    const results = new Set<number>();
    for (let i = 0; i < 50; i++) {
      results.add(diffPrivacyNoise(original, 1.0));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  test('scenario 02 — Laplacian noise produces both positive and negative shifts', () => {
    let above = 0;
    let below = 0;
    for (let i = 0; i < 200; i++) {
      const noisy = diffPrivacyNoise(100, 1.0);
      if (noisy > 100) {
        above++;
      }
      if (noisy < 100) {
        below++;
      }
    }
    expect(above).toBeGreaterThan(0);
    expect(below).toBeGreaterThan(0);
  });

  test('scenario 03 — higher epsilon (1.0) produces less noise than lower epsilon (0.1)', () => {
    let varLow = 0;
    let varHigh = 0;
    for (let i = 0; i < 100; i++) {
      varLow += Math.abs(diffPrivacyNoise(0, 0.1));
      varHigh += Math.abs(diffPrivacyNoise(0, 1.0));
    }
    expect(varLow / 100).toBeGreaterThan(varHigh / 100);
  });

  test('scenario 04 — epsilon=1.0 default parameter works', () => {
    const result = diffPrivacyNoise(0.5);
    expect(typeof result).toBe('number');
    expect(Number.isFinite(result)).toBe(true);
  });

  test('scenario 05 — epsilon=10.0 produces small noise (low privacy)', () => {
    const values: number[] = [];
    for (let i = 0; i < 100; i++) {
      values.push(diffPrivacyNoise(0.5, 10.0));
    }
    const maxAbs = Math.max(...values.map((v) => Math.abs(v - 0.5)));
    expect(maxAbs).toBeLessThan(2.0);
  });

  test('scenario 06 — negative input values are handled correctly', () => {
    const results: number[] = [];
    for (let i = 0; i < 50; i++) {
      const r = diffPrivacyNoise(-1.0, 1.0);
      expect(Number.isFinite(r)).toBe(true);
      results.push(r);
    }
    const below = results.filter((r) => r < -1.0).length;
    const above = results.filter((r) => r > -1.0).length;
    expect(below).toBeGreaterThan(0);
    expect(above).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  WisdomPrivacyGuardService — enforceKAnonimity                      */
/* ------------------------------------------------------------------ */

describe('WisdomPrivacyGuardService — enforceKAnonimity', () => {
  let service: WisdomPrivacyGuardService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPrivacyGuardService);
  });

  test('scenario 07 — k=4 reject: pattern with evidenceWorkspacesCount=4 throws when minK=5', () => {
    const pattern = makeCandidate({
      evidenceWorkspacesCount: 4,
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d'],
    });
    expect(() => service.enforceKAnonimity(pattern, 5)).toThrow(WisdomPrivacyViolationError);
    expect(() => service.enforceKAnonimity(pattern, 5)).toThrow(/evidenceWorkspacesCount=4/);
  });

  test('scenario 08 — k=5 accept: pattern with evidenceWorkspacesCount=5 passes when minK=5', () => {
    const pattern = makeCandidate({
      evidenceWorkspacesCount: 5,
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
    });
    expect(() => service.enforceKAnonimity(pattern, 5)).not.toThrow();
    const result = service.enforceKAnonimity(pattern, 5);
    expect(result.patternId).toBe('pat_test');
  });

  test('scenario 09 — pattern with evidenceWorkspacesCount=7 passes minK=5', () => {
    const pattern = makeCandidate({
      evidenceWorkspacesCount: 7,
      evidenceWorkspaceIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(() => service.enforceKAnonimity(pattern, 5)).not.toThrow();
  });

  test('scenario 10 — default minK=5 rejects pattern with evidenceWorkspacesCount=3', () => {
    const pattern = makeCandidate({
      evidenceWorkspacesCount: 3,
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c'],
    });
    expect(() => service.enforceKAnonimity(pattern)).toThrow(WisdomPrivacyViolationError);
  });

  test('scenario 11 — custom minK=3 accepts pattern with evidenceWorkspacesCount=3', () => {
    const pattern = makeCandidate({
      evidenceWorkspacesCount: 3,
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c'],
    });
    expect(() => service.enforceKAnonimity(pattern, 3)).not.toThrow();
  });

  test('scenario 12 — custom minK=10 rejects pattern with evidenceWorkspacesCount=9', () => {
    const pattern = makeCandidate({
      evidenceWorkspacesCount: 9,
      evidenceWorkspaceIds: Array.from({ length: 9 }, (_, i) => `wks_${i}`),
    });
    expect(() => service.enforceKAnonimity(pattern, 10)).toThrow(WisdomPrivacyViolationError);
  });

  test('scenario 13 — error contains k_anonymity reason and patternId', () => {
    const pattern = makeCandidate({
      patternId: 'pat_unique_42',
      evidenceWorkspacesCount: 2,
    });
    try {
      service.enforceKAnonimity(pattern, 5);
      throw new Error('Expected WisdomPrivacyViolationError but none was thrown');
    } catch (err) {
      expect(err instanceof WisdomPrivacyViolationError).toBe(true);
      const e = err as WisdomPrivacyViolationError;
      expect(e.reason).toBe('k_anonymity');
      expect(e.patternId).toBe('pat_unique_42');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  WisdomPrivacyGuardService — guardProjection                        */
/* ------------------------------------------------------------------ */

describe('WisdomPrivacyGuardService — guardProjection', () => {
  let service: WisdomPrivacyGuardService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPrivacyGuardService);
  });

  test('scenario 14 — reject projection when pattern description contains workspaceId token', () => {
    const patterns: WisdomPattern[] = [
      {
        patternId: 'pat_leak',
        description: 'Pattern for wks_001 shows high conversion',
        applicableConditions: [],
        evidenceWorkspacesCount: 3,
        confidence: 0.7,
        signalKind: 'conversion_rate',
        taxonomy: {},
      },
    ];
    expect(() => service.guardProjection(patterns)).toThrow(WisdomPrivacyViolationError);
    expect(() => service.guardProjection(patterns)).toThrow(/attribution/);
  });

  test('scenario 15 — accepts clean patterns without PII violations', () => {
    const patterns: WisdomPattern[] = [
      {
        patternId: 'pat_clean_1',
        description: 'Conversion rate averages 25% across 3 workspaces',
        applicableConditions: ['conversion_rate > 0'],
        evidenceWorkspacesCount: 3,
        confidence: 0.7,
        signalKind: 'conversion_rate',
        taxonomy: {},
      },
      {
        patternId: 'pat_clean_2',
        description: 'Reply rate averages 70% across 5 workspaces',
        applicableConditions: ['reply_rate > 0'],
        evidenceWorkspacesCount: 5,
        confidence: 0.8,
        signalKind: 'reply_rate',
        taxonomy: {},
      },
    ];
    expect(() => service.guardProjection(patterns)).not.toThrow();
  });

  test('scenario 16 — reject projection when applicableConditions contain PII', () => {
    const patterns: WisdomPattern[] = [
      {
        patternId: 'pat_cond_leak',
        description: 'Clean description',
        applicableConditions: ['segment:wks_abc'],
        evidenceWorkspacesCount: 2,
        confidence: 0.6,
        signalKind: 'conversion_rate',
        taxonomy: {},
      },
    ];
    expect(() => service.guardProjection(patterns)).toThrow(WisdomPrivacyViolationError);
  });

  test('scenario 17 — rejects when description contains email pattern', () => {
    const patterns: WisdomPattern[] = [
      {
        patternId: 'pat_email',
        description: 'Pattern based on email addresses across workspaces',
        applicableConditions: [],
        evidenceWorkspacesCount: 3,
        confidence: 0.5,
        signalKind: 'reply_rate',
        taxonomy: {},
      },
    ];
    expect(() => service.guardProjection(patterns)).toThrow(WisdomPrivacyViolationError);
  });

  test('scenario 18 — empty pattern list passes without error', () => {
    expect(() => service.guardProjection([])).not.toThrow();
  });

  test('scenario 19 — detects violation in second pattern of a multi-pattern list', () => {
    const patterns: WisdomPattern[] = [
      {
        patternId: 'pat_good',
        description: 'Clean cross-workspace signal',
        applicableConditions: [],
        evidenceWorkspacesCount: 3,
        confidence: 0.7,
        signalKind: 'conversion_rate',
        taxonomy: {},
      },
      {
        patternId: 'pat_bad',
        description: 'Data from userId ABC leaked',
        applicableConditions: [],
        evidenceWorkspacesCount: 3,
        confidence: 0.7,
        signalKind: 'conversion_rate',
        taxonomy: {},
      },
    ];
    expect(() => service.guardProjection(patterns)).toThrow(WisdomPrivacyViolationError);
  });
});

/* ------------------------------------------------------------------ */
/*  WisdomPrivacyGuardService — filterOptedOut (opt-out enforcement)   */
/* ------------------------------------------------------------------ */

describe('WisdomPrivacyGuardService — filterOptedOut', () => {
  let service: WisdomPrivacyGuardService;
  let optService: WisdomOptService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPrivacyGuardService);
    optService = moduleRef.get(WisdomOptService);
  });

  test('scenario 20 — pattern with all opted-in workspaces passes filter', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');
    optService.optIn('wks_e', 'produtor');

    const pattern = makeCandidate({
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
      evidenceWorkspacesCount: 5,
    });
    const result = service.filterOptedOut([pattern], 5);
    expect(result).toHaveLength(1);
  });

  test('scenario 21 — drops pattern when none of its workspaces opted in', () => {
    const pattern = makeCandidate({
      evidenceWorkspaceIds: ['wks_x', 'wks_y', 'wks_z', 'wks_t', 'wks_u'],
      evidenceWorkspacesCount: 5,
    });
    const result = service.filterOptedOut([pattern], 5);
    expect(result).toHaveLength(0);
  });

  test('scenario 22 — drops pattern when some workspaces opted out and surviving count < minK', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');

    const pattern = makeCandidate({
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_x', 'wks_y'],
      evidenceWorkspacesCount: 5,
    });
    const result = service.filterOptedOut([pattern], 4);
    expect(result).toHaveLength(0);
  });

  test('scenario 23 — keeps pattern when some opted out but surviving count >= minK', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');
    optService.optIn('wks_e', 'produtor');

    const pattern = makeCandidate({
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e', 'wks_x'],
      evidenceWorkspacesCount: 6,
    });
    const result = service.filterOptedOut([pattern], 5);
    expect(result).toHaveLength(1);
    expect(result[0]?.evidenceWorkspacesCount).toBe(5);
    expect(result[0]?.evidenceWorkspaceIds).not.toContain('wks_x');
  });

  test('scenario 24 — workspace opted in via any role qualifies (not just produtor)', () => {
    optService.optIn('wks_a', 'gestor');
    optService.optIn('wks_b', 'afiliado');
    optService.optIn('wks_c', 'agencia');
    optService.optIn('wks_d', 'creator');
    optService.optIn('wks_e', 'closer');

    const pattern = makeCandidate({
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
      evidenceWorkspacesCount: 5,
    });
    const result = service.filterOptedOut([pattern], 5);
    expect(result).toHaveLength(1);
  });

  test('scenario 25 — opt-out is respected: pattern that was opted in is dropped after optOut', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');
    optService.optIn('wks_e', 'produtor');

    const pattern = makeCandidate({
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
      evidenceWorkspacesCount: 5,
    });

    expect(service.filterOptedOut([pattern], 5)).toHaveLength(1);

    optService.optOut('wks_d', 'produtor');
    optService.optOut('wks_e', 'produtor');

    const resultAfter = service.filterOptedOut([pattern], 3);
    expect(resultAfter).toHaveLength(1);
    expect(resultAfter[0]?.evidenceWorkspacesCount).toBe(3);
    expect(resultAfter[0]?.evidenceWorkspaceIds).toEqual(['wks_a', 'wks_b', 'wks_c']);
  });

  test('scenario 26 — default minK=5 in filterOptedOut', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');

    const pattern = makeCandidate({
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d'],
      evidenceWorkspacesCount: 4,
    });
    const result = service.filterOptedOut([pattern]);
    expect(result).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  WisdomPrivacyGuardService — fullPrivacyAudit                       */
/* ------------------------------------------------------------------ */

describe('WisdomPrivacyGuardService — fullPrivacyAudit', () => {
  let service: WisdomPrivacyGuardService;
  let optService: WisdomOptService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPrivacyGuardService);
    optService = moduleRef.get(WisdomOptService);
  });

  test('scenario 27 — full audit rejects k-anonymity failures', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');

    const pattern = makeCandidate({
      patternId: 'pat_low_k',
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d'],
      evidenceWorkspacesCount: 4,
    });
    const result = service.fullPrivacyAudit([pattern], { minK: 5 });
    expect(result.passed).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('k_anonymity');
    expect(result.rejected[0]?.patternId).toBe('pat_low_k');
  });

  test('scenario 28 — full audit rejects opt-out failures', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');

    const pattern = makeCandidate({
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_x', 'wks_y'],
      evidenceWorkspacesCount: 5,
    });
    const result = service.fullPrivacyAudit([pattern], { minK: 5 });
    expect(result.passed).toHaveLength(0);
    expect(result.rejected.length).toBeGreaterThanOrEqual(1);
    expect(result.rejected.some((r) => r.reason === 'opt_out')).toBe(true);
  });

  test('scenario 29 — full audit rejects attribution leaks', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');
    optService.optIn('wks_e', 'produtor');

    const pattern = makeCandidate({
      description: 'Pattern for wks_001 shows high conversion',
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
      evidenceWorkspacesCount: 5,
    });
    const result = service.fullPrivacyAudit([pattern], { minK: 5 });
    expect(result.passed).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'attribution_leak')).toBe(true);
  });

  test('scenario 30 — full audit passes clean pattern with opted-in workspaces and sufficient K', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');
    optService.optIn('wks_e', 'produtor');

    const pattern = makeCandidate({
      description: 'Conversion rate averages 50% across 5 workspaces',
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
      evidenceWorkspacesCount: 5,
    });
    const result = service.fullPrivacyAudit([pattern], { minK: 5 });
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.patternId).toBe('pat_test');
    expect(result.rejected).toHaveLength(0);
  });

  test('scenario 31 — full audit produces multiple rejection records from mixed causes', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');
    optService.optIn('wks_e', 'produtor');

    const candidates = [
      makeCandidate({
        patternId: 'pat_low_k',
        evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c'],
        evidenceWorkspacesCount: 3,
      }),
      makeCandidate({
        patternId: 'pat_opted_out',
        evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_x', 'wks_y'],
        evidenceWorkspacesCount: 5,
      }),
      makeCandidate({
        patternId: 'pat_leak',
        description: 'Pattern contains lead_abc123',
        evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
        evidenceWorkspacesCount: 5,
      }),
      makeCandidate({
        patternId: 'pat_clean',
        description: 'Conversion rate averages 40% across 5 workspaces',
        evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
        evidenceWorkspacesCount: 5,
      }),
    ];

    const result = service.fullPrivacyAudit(candidates, { minK: 5 });
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0]?.patternId).toBe('pat_clean');
    expect(result.rejected.length).toBeGreaterThanOrEqual(3);

    const reasons = result.rejected.map((r) => r.reason);
    expect(reasons).toContain('k_anonymity');
    expect(reasons).toContain('opt_out');
    expect(reasons).toContain('attribution_leak');
  });

  test('scenario 32 — full audit uses default minK=5', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');
    optService.optIn('wks_e', 'produtor');

    const candidate = makeCandidate({
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d'],
      evidenceWorkspacesCount: 4,
    });
    const result = service.fullPrivacyAudit([candidate]);
    expect(result.passed).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('k_anonymity');
  });
});

/* ------------------------------------------------------------------ */
/*  WisdomPrivacyGuardService — integration with wisdom-anonymizer     */
/* ------------------------------------------------------------------ */

describe('WisdomPrivacyGuardService — integration', () => {
  let service: WisdomPrivacyGuardService;
  let optService: WisdomOptService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPrivacyGuardService);
    optService = moduleRef.get(WisdomOptService);
  });

  test('scenario 33 — enforceKAnonimity + filterOptedOut + guardProjection chained works', () => {
    optService.optIn('wks_a', 'produtor');
    optService.optIn('wks_b', 'produtor');
    optService.optIn('wks_c', 'produtor');
    optService.optIn('wks_d', 'produtor');
    optService.optIn('wks_e', 'produtor');

    const candidate = makeCandidate({
      description: 'Conversion rate averages 50% across 5 workspaces',
      evidenceWorkspaceIds: ['wks_a', 'wks_b', 'wks_c', 'wks_d', 'wks_e'],
      evidenceWorkspacesCount: 5,
    });

    const passed = service.enforceKAnonimity(candidate, 5);
    expect(passed.patternId).toBe('pat_test');

    const filtered = service.filterOptedOut([passed], 5);
    expect(filtered).toHaveLength(1);

    const wp: WisdomPattern = {
      patternId: filtered[0]!.patternId,
      description: filtered[0]!.description,
      applicableConditions: filtered[0]!.applicableConditions,
      evidenceWorkspacesCount: filtered[0]!.evidenceWorkspacesCount,
      confidence: filtered[0]!.confidence,
      signalKind: filtered[0]!.signalKind,
      taxonomy: {},
    };
    expect(() => service.guardProjection([wp])).not.toThrow();
  });

  test('scenario 34 — all opted-out workspaces with no data at all returns empty', () => {
    const candidates: CandidatePattern[] = [
      makeCandidate({
        patternId: 'pat_a',
        evidenceWorkspaceIds: ['wks_x', 'wks_y', 'wks_z', 'wks_t', 'wks_u'],
        evidenceWorkspacesCount: 5,
      }),
    ];
    const result = service.fullPrivacyAudit(candidates, { minK: 5 });
    expect(result.passed).toHaveLength(0);
    expect(result.rejected.length).toBeGreaterThanOrEqual(1);
  });
});
