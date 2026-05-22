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

  test('scenario 24 — workspace opted in via an opted-in role qualifies (not just produtor)', () => {
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
