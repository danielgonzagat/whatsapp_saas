import { ConflictDetectorService } from './conflict.detector';
import { CrossRolePatternDetectorService } from './cross-role-pattern.detector';
import type { WorkspaceRoleSignal } from './cross-role-pattern.detector';
import { EcosystemPrivacyGuardService } from './ecosystem-privacy.guard';
import { OpportunityRankerService } from './opportunity.ranker';
import {
  AffiliateProductFitService,
  AgencySellerFitService,
  CreatorOfferFitService,
  ProducerAffiliateFitService,
} from './role-fits';
import type { FingerprintProfile } from './role-fits';
import { SuggestionDeliveryService } from './suggestion-delivery.service';
import type { OpportunityRanking, RoleFitMatch } from './ecosys.types';

describe('CrossRolePatternDetectorService (UTP-ECOSYS-001)', () => {
  const svc = new CrossRolePatternDetectorService();

  it('returns empty when fewer than 3 workspaces share a token', () => {
    const signals: WorkspaceRoleSignal[] = [
      { workspaceFingerprint: 'fp_a', role: 'produtor', tokens: ['x'] },
      { workspaceFingerprint: 'fp_b', role: 'afiliado', tokens: ['x'] },
    ];
    expect(svc.detect(signals)).toHaveLength(0);
  });

  it('detects pattern across roles with sufficient evidence', () => {
    const signals: WorkspaceRoleSignal[] = [
      { workspaceFingerprint: 'fp_a', role: 'produtor', tokens: ['hot_offer'] },
      { workspaceFingerprint: 'fp_b', role: 'afiliado', tokens: ['hot_offer'] },
      { workspaceFingerprint: 'fp_c', role: 'creator', tokens: ['hot_offer'] },
    ];
    const out = svc.detect(signals);
    expect(out).toHaveLength(1);
    expect(out[0]?.observedAcrossRoles).toEqual(['afiliado', 'creator', 'produtor']);
  });
});

describe('Role-fit services (UTP-ECOSYS-002..005)', () => {
  const profiles: FingerprintProfile[] = [
    { workspaceFingerprint: 'fp_p', role: 'produtor', capabilities: ['cap_a', 'cap_b'], needs: [] },
    { workspaceFingerprint: 'fp_a', role: 'afiliado', capabilities: [], needs: ['cap_a', 'cap_b'] },
    { workspaceFingerprint: 'fp_c', role: 'creator', capabilities: ['cap_a'], needs: [] },
    { workspaceFingerprint: 'fp_g', role: 'agencia', capabilities: ['ops'], needs: [] },
    { workspaceFingerprint: 'fp_s', role: 'closer', capabilities: [], needs: ['ops'] },
  ];

  it('producer↔affiliate fit detects matching capability+need', () => {
    const out = new ProducerAffiliateFitService().detect(profiles);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.roleA).toBe('produtor');
    expect(out[0]?.roleB).toBe('afiliado');
  });

  it('affiliate↔product fit detects reverse direction', () => {
    const reversed: FingerprintProfile[] = [
      { workspaceFingerprint: 'fp_a', role: 'afiliado', capabilities: ['traffic'], needs: [] },
      { workspaceFingerprint: 'fp_p', role: 'produtor', capabilities: [], needs: ['traffic'] },
    ];
    const out = new AffiliateProductFitService().detect(reversed);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.roleA).toBe('afiliado');
    expect(out[0]?.roleB).toBe('produtor');
  });

  it('creator↔offer fit detects creator with capability fitting producer needs', () => {
    const ps: FingerprintProfile[] = [
      { workspaceFingerprint: 'fp_c', role: 'creator', capabilities: ['audience_xyz'], needs: [] },
      { workspaceFingerprint: 'fp_p', role: 'produtor', capabilities: [], needs: ['audience_xyz'] },
    ];
    const out = new CreatorOfferFitService().detect(ps);
    expect(out.length).toBeGreaterThan(0);
  });

  it('agency↔seller fit detects ops capability fitting closer needs', () => {
    const out = new AgencySellerFitService().detect(profiles);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.roleA).toBe('agencia');
  });
});

describe('OpportunityRankerService (UTP-ECOSYS-006)', () => {
  const ranker = new OpportunityRankerService();
  function fit(score: number, fitId: string): RoleFitMatch {
    return {
      fitId,
      producerWorkspaceFingerprint: 'fp_a',
      partnerWorkspaceFingerprint: 'fp_b',
      roleA: 'produtor',
      roleB: 'afiliado',
      score,
      reasonTokens: [],
    };
  }

  it('ranks fits by composite score descending', () => {
    const out = ranker.rank([fit(0.9, 'a'), fit(0.5, 'b'), fit(0.7, 'c')]);
    expect(out[0]?.opportunityId).toBe('opp_a');
    expect(out[1]?.opportunityId).toBe('opp_c');
    expect(out[2]?.opportunityId).toBe('opp_b');
    expect(out[0]?.rank).toBe(1);
  });

  it('caps results when cap is provided', () => {
    const out = ranker.rank(
      [fit(0.9, 'a'), fit(0.7, 'b'), fit(0.5, 'c')],
      { cap: 2 },
    );
    expect(out).toHaveLength(2);
  });

  it('drops opportunities with composite score 0', () => {
    const out = ranker.rank(
      [fit(0.9, 'a')],
      { conflictRiskByFitId: new Map([['a', 1]]) },
    );
    expect(out).toHaveLength(0);
  });
});

describe('EcosystemPrivacyGuardService (UTP-ECOSYS-007)', () => {
  const guard = new EcosystemPrivacyGuardService();

  it('PASS when payload has no PII patterns', () => {
    const v = guard.scan({ summary: 'High-fit opportunity', score: 0.8 });
    expect(v.verdict).toBe('PASS');
    expect(v.leaksDetected).toHaveLength(0);
  });

  it('FAIL on workspace ID leak', () => {
    const v = guard.scan({ summary: 'workspace wks_demo_001 has high fit' });
    expect(v.verdict).toBe('FAIL');
    expect(v.leaksDetected[0]).toContain('workspace-id');
  });

  it('FAIL on email leak', () => {
    const v = guard.scan({ contact: 'someone@example.com' });
    expect(v.verdict).toBe('FAIL');
  });

  it('FAIL on lead-id leak in nested array', () => {
    const v = guard.scan({ items: [{ ref: 'lead_8f4c9b' }] });
    expect(v.verdict).toBe('FAIL');
  });

  it('FAIL on CPF or CNPJ leak', () => {
    expect(guard.scan({ doc: '123.456.789-00' }).verdict).toBe('FAIL');
    expect(guard.scan({ doc: '12.345.678/0001-99' }).verdict).toBe('FAIL');
  });
});

describe('ConflictDetectorService (UTP-ECOSYS-008)', () => {
  const svc = new ConflictDetectorService();
  const baseFit: RoleFitMatch = {
    fitId: 'fit_1',
    producerWorkspaceFingerprint: 'fp_a',
    partnerWorkspaceFingerprint: 'fp_b',
    roleA: 'produtor',
    roleB: 'afiliado',
    score: 0.8,
    reasonTokens: [],
  };

  it('detects self-deal when same owner controls both workspaces', () => {
    const conflicts = svc.detect([baseFit], {
      sharedOwnerByWorkspace: new Map([
        ['fp_a', 'owner_x'],
        ['fp_b', 'owner_x'],
      ]),
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe('self-deal');
    expect(conflicts[0]?.silenceRecommended).toBe(true);
  });

  it('detects opt-out workspaces', () => {
    const conflicts = svc.detect([baseFit], {
      userOptedOutWorkspaces: new Set(['fp_a']),
    });
    expect(conflicts[0]?.kind).toBe('incentive-bias');
  });

  it('detects platform bias when internal revenue share > 0.5', () => {
    const conflicts = svc.detect([baseFit], {
      platformInternalRevenueShareForFit: new Map([['fit_1', 0.7]]),
    });
    expect(conflicts[0]?.kind).toBe('incentive-bias');
  });

  it('detects no conflict for clean fit', () => {
    expect(svc.detect([baseFit])).toHaveLength(0);
  });
});

describe('SuggestionDeliveryService (UTP-ECOSYS-009)', () => {
  const svc = new SuggestionDeliveryService(new EcosystemPrivacyGuardService());
  const opportunity: OpportunityRanking = {
    opportunityId: 'opp_xyz',
    description: 'Match between producer and affiliate',
    impactScore: 0.8,
    viability: 0.7,
    conflictRisk: 0.1,
    rank: 1,
  };

  it('delivers a clean suggestion successfully', () => {
    const r = svc.deliver({
      opportunity,
      recipientFingerprint: 'fp_recipient',
      recipientRole: 'produtor',
      channel: 'inbox',
      explanation: 'Your audience matches their need',
    });
    expect(r.status).toBe('delivered');
  });

  it('silences when a conflict says so', () => {
    const r = svc.deliver({
      opportunity,
      recipientFingerprint: 'fp_recipient',
      recipientRole: 'produtor',
      channel: 'inbox',
      explanation: 'X',
      conflicts: [
        {
          conflictId: 'c1',
          kind: 'self-deal',
          description: 'shared owner',
          silenceRecommended: true,
        },
      ],
    });
    expect(r.status).toBe('silenced');
  });

  it('blocks delivery when payload contains PII', () => {
    const r = svc.deliver({
      opportunity,
      recipientFingerprint: 'fp_recipient',
      recipientRole: 'produtor',
      channel: 'inbox',
      explanation: 'Look at lead_8f4c9b for the match',
    });
    expect(r.status).toBe('privacy_blocked');
  });

  it('attaches disclosure when provided', () => {
    const r = svc.deliver({
      opportunity,
      recipientFingerprint: 'fp_recipient',
      recipientRole: 'produtor',
      channel: 'inbox',
      explanation: 'clean explanation',
      disclosure: 'Kloel has commercial link with the recommended party',
    });
    expect(r.status).toBe('delivered');
    if (r.status !== 'delivered') return;
    expect(r.suggestion.disclosure).toBeTruthy();
  });
});
