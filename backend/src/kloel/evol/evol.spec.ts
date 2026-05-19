import { GapDetector } from './gap.detector';
import type { GapSignal } from './gap.detector';
import { ProposalBuilder } from './proposal.builder';
import { HumanAuthorizationGateway } from './human-authorization.gateway';
import { AgentOrchestrationBridgeService } from './agent-orchestration.bridge';
import { ExperimentRunner } from './experiment.runner';
import { RTierDeltaMonitor } from './r-tier-delta.monitor';
import { AutomaticRollbackService } from './automatic-rollback.service';
import { ProtectedFilesFirewallService } from './protected-files.firewall';
import { CodacyRigorEnforcer } from './codacy-rigor.enforcer';
import { EvolutionAuditLog } from './evolution-audit.log';
import type { SelfGap, ImprovementProposal, HumanAuthorization, RTier } from './types';
import { commercialImpactWeight, tierToNumber } from './types';

function makePaymentSignal(workspaceId = 'ws-1'): GapSignal {
  return {
    eventName: 'commerce.payment.failed',
    workspaceId,
    domain: 'payments',
    severityScore: 0.9,
    revenueRiskCents: 50000,
  };
}

function makeAuthSignal(workspaceId = 'ws-1'): GapSignal {
  return {
    eventName: 'auth.refresh_token_expired',
    workspaceId,
    domain: 'auth',
    severityScore: 0.7,
    revenueRiskCents: 20000,
  };
}

function makeGap(workspaceId = 'ws-1', domain = 'payments'): SelfGap {
  return {
    id: `gap-${workspaceId}-1`,
    workspaceId,
    domain,
    description: `Detected capability gap in ${domain} domain`,
    severity: 'critical',
    commercialImpact: 'revenue_blocking',
    estimatedRevenueRiskCents: 90000,
    detectedAt: new Date().toISOString(),
    sourceEvidence: ['test_event'],
    confidence: 0.9,
  };
}

function makeProposal(workspaceId = 'ws-1'): ImprovementProposal {
  const gap = makeGap(workspaceId);
  return {
    id: `prop-${workspaceId}-1`,
    gapId: gap.id,
    workspaceId,
    description: 'Add idempotency guard to payment webhook handler (gap: test)',
    targetFiles: ['backend/src/payments/**'],
    expectedDelta: 'Reduce revenue risk by resolving revenue_blocking in payments',
    riskAssessment: 'critical',
    evidence: ['test_event'],
    generatedAt: new Date().toISOString(),
    status: 'draft',
  };
}

describe('Evol module (UTP-EVOL-001..010)', () => {
  describe('types.ts utilities', () => {
    it('commercialImpactWeight returns correct weights', () => {
      expect(commercialImpactWeight('revenue_blocking')).toBe(1.0);
      expect(commercialImpactWeight('trust_eroding')).toBe(0.9);
      expect(commercialImpactWeight('quality_degrading')).toBe(0.7);
      expect(commercialImpactWeight('opportunity_missed')).toBe(0.5);
      expect(commercialImpactWeight('neutral')).toBe(0.1);
    });

    it('tierToNumber maps correctly', () => {
      expect(tierToNumber('tier_1_functional')).toBe(1);
      expect(tierToNumber('tier_2_partial')).toBe(2);
      expect(tierToNumber('tier_3_facade')).toBe(3);
      expect(tierToNumber('tier_4_shell')).toBe(4);
    });
  });

  describe('GapDetector (EVOL-001)', () => {
    const svc = new GapDetector();

    beforeEach(() => svc.resetCounter());

    it('detects payment gap with revenue risk', () => {
      const gaps = svc.detect([makePaymentSignal()]);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]!.domain).toBe('payments');
      expect(gaps[0]!.severity).toBe('critical');
      expect(gaps[0]!.commercialImpact).toBe('revenue_blocking');
      expect(gaps[0]!.estimatedRevenueRiskCents).toBeGreaterThan(0);
    });

    it('detects auth gap with trust impact', () => {
      const gaps = svc.detect([makeAuthSignal()]);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]!.domain).toBe('auth');
      expect(gaps[0]!.commercialImpact).toBe('trust_eroding');
    });

    it('ignores signals with confidence below 0.3', () => {
      const signal: GapSignal = {
        eventName: 'test.low',
        workspaceId: 'ws-1',
        domain: 'payments',
        severityScore: 0.1,
        revenueRiskCents: 100,
      };
      expect(svc.detect([signal])).toHaveLength(0);
    });

    it('ignores unknown domains', () => {
      const signal: GapSignal = {
        eventName: 'test.unknown',
        workspaceId: 'ws-1',
        domain: 'unknown_domain',
        severityScore: 0.8,
        revenueRiskCents: 100,
      };
      expect(svc.detect([signal])).toHaveLength(0);
    });

    it('returns gaps sorted by estimated revenue risk descending', () => {
      const signals: GapSignal[] = [
        makeAuthSignal(),
        makePaymentSignal(),
      ];
      const gaps = svc.detect(signals);
      expect(gaps.length).toBeGreaterThanOrEqual(1);
      expect(gaps[0]!.estimatedRevenueRiskCents).toBeGreaterThanOrEqual(gaps[gaps.length - 1]!.estimatedRevenueRiskCents);
    });

    it('estimates total risk across all gaps', () => {
      const signals: GapSignal[] = [makePaymentSignal(), makeAuthSignal()];
      const gaps = svc.detect(signals);
      const total = svc.estimateTotalRisk(gaps);
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('ProposalBuilder (EVOL-002)', () => {
    const svc = new ProposalBuilder();

    beforeEach(() => svc.resetCounter());

    it('builds proposal from gap', () => {
      const gap = makeGap();
      const proposal = svc.build(gap, []);
      expect(proposal.gapId).toBe(gap.id);
      expect(proposal.status).toBe('draft');
      expect(proposal.riskAssessment).toBe('critical');
    });

    it('builds proposals for all gaps', () => {
      const gaps = [makeGap('ws-1', 'payments'), makeGap('ws-2', 'auth')];
      const proposals = svc.buildAll(gaps, []);
      expect(proposals).toHaveLength(2);
      expect(proposals[0]!.workspaceId).toBe('ws-1');
      expect(proposals[1]!.workspaceId).toBe('ws-2');
    });

    it('submits draft proposal', () => {
      const proposal = svc.build(makeGap(), []);
      const submitted = svc.submit(proposal);
      expect(submitted.status).toBe('submitted');
    });

    it('does not re-submit already submitted proposal', () => {
      const proposal = svc.build(makeGap(), []);
      const submitted = svc.submit(proposal);
      const reSubmitted = svc.submit(submitted);
      expect(reSubmitted.status).toBe('submitted');
    });
  });

  describe('HumanAuthorizationGateway (EVOL-003)', () => {
    const svc = new HumanAuthorizationGateway();

    it('creates pending authorization for proposal', () => {
      const proposal = makeProposal();
      const auth = svc.requestAuthorization(proposal, 'human-admin');
      expect(auth.status).toBe('pending');
      expect(auth.authorityLevel).toBe('human_required');
    });

    it('approves pending authorization', () => {
      const proposal = makeProposal();
      const auth = svc.requestAuthorization(proposal, 'human-admin');
      const approved = svc.approve(auth.id, 'human-admin', 'looks good');
      expect(approved).not.toBeNull();
      expect(approved!.status).toBe('approved');
      expect(approved!.authorizedAt).not.toBeNull();
    });

    it('rejects pending authorization', () => {
      const proposal = makeProposal();
      const auth = svc.requestAuthorization(proposal, 'human-admin');
      const rejected = svc.reject(auth.id, 'human-admin', 'not safe');
      expect(rejected).not.toBeNull();
      expect(rejected!.status).toBe('rejected');
    });

    it('isAuthorized returns true for approved auth', () => {
      const proposal = makeProposal();
      const auth = svc.requestAuthorization(proposal, 'human-admin');
      svc.approve(auth.id, 'human-admin', 'ok');
      expect(svc.isAuthorized(auth.id)).toBe(true);
    });

    it('isAuthorized returns false for rejected auth', () => {
      const proposal = makeProposal();
      const auth = svc.requestAuthorization(proposal, 'human-admin');
      svc.reject(auth.id, 'human-admin', 'no');
      expect(svc.isAuthorized(auth.id)).toBe(false);
    });

    it('requiresHumanApproval returns true for critical proposals', () => {
      const proposal = makeProposal();
      expect(svc.requiresHumanApproval(proposal)).toBe(true);
    });
  });

  describe('AgentOrchestrationBridgeService (EVOL-004)', () => {
    let svc: AgentOrchestrationBridgeService;

    beforeEach(() => {
      svc = new AgentOrchestrationBridgeService();
    });

    function makeApprovedAuth(): HumanAuthorization {
      return {
        id: 'auth-ws-1-1',
        proposalId: 'prop-1',
        workspaceId: 'ws-1',
        status: 'approved',
        authorityLevel: 'human_required',
        humanPrincipal: 'human-admin',
        reason: 'approved',
        authorizedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        scope: ['backend/src/payments/**'],
      };
    }

    it('dispatches task for approved authorization', () => {
      const auth = makeApprovedAuth();
      const bridge = svc.dispatch(auth, 'coding-agent-1');
      expect(bridge).not.toBeNull();
      expect(bridge!.status).toBe('dispatched');
      expect(bridge!.targetAgent).toBe('coding-agent-1');
    });

    it('rejects dispatch for non-approved authorization', () => {
      const auth = { ...makeApprovedAuth(), status: 'pending' as const };
      expect(svc.dispatch(auth, 'coding-agent-1')).toBeNull();
    });

    it('completes dispatched bridge', () => {
      const auth = makeApprovedAuth();
      const bridge = svc.dispatch(auth, 'coding-agent-1')!;
      const completed = svc.complete(bridge.id, 'abc123hash');
      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
      expect(completed!.resultHash).toBe('abc123hash');
    });

    it('fails dispatched bridge', () => {
      const auth = makeApprovedAuth();
      const bridge = svc.dispatch(auth, 'coding-agent-1')!;
      const failed = svc.fail(bridge.id, 'build error');
      expect(failed).not.toBeNull();
      expect(failed!.status).toBe('failed');
      expect(failed!.errorMessage).toBe('build error');
    });

    it('lists bridges by authorization', () => {
      const auth = makeApprovedAuth();
      svc.dispatch(auth, 'agent-1');
      svc.dispatch(auth, 'agent-2');
      expect(svc.listByAuthorization(auth.id)).toHaveLength(2);
    });
  });

  describe('ExperimentRunner (EVOL-005)', () => {
    const svc = new ExperimentRunner();

    function makeApprovedAuth(): HumanAuthorization {
      return {
        id: 'auth-ws-1-1',
        proposalId: 'prop-1',
        workspaceId: 'ws-1',
        status: 'approved',
        authorityLevel: 'human_required',
        humanPrincipal: 'human-admin',
        reason: 'approved',
        authorizedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        scope: [],
      };
    }

    it('starts experiment for approved authorization', () => {
      const run = svc.start(makeProposal(), makeApprovedAuth());
      expect(run).not.toBeNull();
      expect(run!.status).toBe('running');
    });

    it('rejects experiment for non-approved authorization', () => {
      const auth = { ...makeApprovedAuth(), status: 'pending' as const };
      expect(svc.start(makeProposal(), auth)).toBeNull();
    });

    it('completes running experiment', () => {
      const run = svc.start(makeProposal(), makeApprovedAuth())!;
      const completed = svc.complete(run.id, 3, 'confirmed');
      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
      expect(completed!.verdict).toBe('confirmed');
      expect(completed!.evidenceCount).toBe(3);
    });

    it('fails running experiment', () => {
      const run = svc.start(makeProposal(), makeApprovedAuth())!;
      const failed = svc.fail(run.id, 'timeout');
      expect(failed).not.toBeNull();
      expect(failed!.status).toBe('failed');
    });
  });
