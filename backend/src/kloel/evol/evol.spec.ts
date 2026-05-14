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

  describe('RTierDeltaMonitor (EVOL-006)', () => {
    const svc = new RTierDeltaMonitor();

    beforeEach(() => svc.reset());

    it('records R-tier upgrade', () => {
      const delta = svc.record('payments', 'tier_1_functional', { coverage: 0.95 }, 'tests added');
      expect(delta.direction).toBe('upgraded');
      expect(delta.currentTier).toBe('tier_1_functional');
    });

    it('records R-tier downgrade', () => {
      svc.record('payments', 'tier_1_functional', {}, 'initial');
      const delta = svc.record('payments', 'tier_3_facade', {}, 'tests removed');
      expect(delta.direction).toBe('downgraded');
    });

    it('detects downgrades', () => {
      svc.record('payments', 'tier_1_functional', {}, 'initial');
      svc.record('checkout', 'tier_1_functional', {}, 'initial');
      svc.record('payments', 'tier_3_facade', {}, 'degraded');
      expect(svc.getDowngrades()).toHaveLength(1);
    });

    it('lists deltas filtered by module', () => {
      svc.record('payments', 'tier_2_partial', {}, 'test');
      svc.record('auth', 'tier_1_functional', {}, 'test');
      expect(svc.listDeltas('payments')).toHaveLength(1);
    });

    it('returns default tier_4_shell for unknown module', () => {
      expect(svc.getCurrentTier('unknown_module')).toBe('tier_4_shell');
    });

    it('getRecentDeltas respects time window', () => {
      svc.record('payments', 'tier_1_functional', {}, 'recent');
      expect(svc.getRecentDeltas(3600000)).toHaveLength(1);
      expect(svc.getRecentDeltas(-1)).toHaveLength(0);
    });
  });

  describe('AutomaticRollbackService (EVOL-007)', () => {
    let svc: AutomaticRollbackService;

    beforeEach(() => {
      svc = new AutomaticRollbackService();
    });

    it('triggers rollback on R-tier downgrade within window', () => {
      const proposal = makeProposal();
      const delta = {
        workspaceId: 'global',
        module: 'payments',
        previousTier: 'tier_1_functional' as RTier,
        currentTier: 'tier_3_facade' as RTier,
        metrics: {},
        changedAt: new Date().toISOString(),
        direction: 'downgraded' as const,
        reason: 'degraded',
      };
      const rollback = svc.evaluateDelta(proposal, delta);
      expect(rollback).not.toBeNull();
      expect(rollback!.status).toBe('pending');
      expect(rollback!.wasAutomatic).toBe(true);
    });

    it('does not trigger rollback on upgrade', () => {
      const proposal = makeProposal();
      const delta = {
        workspaceId: 'global',
        module: 'payments',
        previousTier: 'tier_3_facade' as RTier,
        currentTier: 'tier_1_functional' as RTier,
        metrics: {},
        changedAt: new Date().toISOString(),
        direction: 'upgraded' as const,
        reason: 'improved',
      };
      expect(svc.evaluateDelta(proposal, delta)).toBeNull();
    });

    it('triggers rollback on refuted experiment verdict', () => {
      const proposal = makeProposal();
      const rollback = svc.evaluateExperiment(proposal, 'refuted');
      expect(rollback).not.toBeNull();
      expect(rollback!.status).toBe('pending');
    });

    it('does not trigger rollback on confirmed verdict', () => {
      const proposal = makeProposal();
      expect(svc.evaluateExperiment(proposal, 'confirmed')).toBeNull();
    });

    it('executes pending rollback', () => {
      const proposal = makeProposal();
      const delta = {
        workspaceId: 'global',
        module: 'payments',
        previousTier: 'tier_1_functional' as RTier,
        currentTier: 'tier_3_facade' as RTier,
        metrics: {},
        changedAt: new Date().toISOString(),
        direction: 'downgraded' as const,
        reason: 'degraded',
      };
      const rb = svc.evaluateDelta(proposal, delta)!;
      const executed = svc.execute(rb.id);
      expect(executed).not.toBeNull();
      expect(executed!.status).toBe('executed');
      expect(executed!.rollbackDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('fails rollback execution', () => {
      const proposal = makeProposal();
      const delta = {
        workspaceId: 'global',
        module: 'payments',
        previousTier: 'tier_1_functional' as RTier,
        currentTier: 'tier_3_facade' as RTier,
        metrics: {},
        changedAt: new Date().toISOString(),
        direction: 'downgraded' as const,
        reason: 'degraded',
      };
      const rb = svc.evaluateDelta(proposal, delta)!;
      const failed = svc.fail(rb.id, 'disk full');
      expect(failed).not.toBeNull();
      expect(failed!.status).toBe('failed');
    });

    it('lists pending rollbacks', () => {
      const proposal = makeProposal();
      const delta = {
        workspaceId: 'global',
        module: 'payments',
        previousTier: 'tier_1_functional' as RTier,
        currentTier: 'tier_3_facade' as RTier,
        metrics: {},
        changedAt: new Date().toISOString(),
        direction: 'downgraded' as const,
        reason: 'degraded',
      };
      svc.evaluateDelta(proposal, delta);
      expect(svc.getPendingRollbacks()).toHaveLength(1);
    });
  });

  describe('ProtectedFilesFirewall (EVOL-008)', () => {
    const svc = new ProtectedFilesFirewallService();

    beforeEach(() => svc.reset());

    it('blocks access to protected governance file', () => {
      const violation = svc.check('CLAUDE.md', 'test-agent');
      expect(violation).not.toBeNull();
      expect(violation!.violationKind).toBe('governance_breach');
      expect(violation!.escalationRequired).toBe(true);
    });

    it('isProtected returns true for protected file', () => {
      expect(svc.isProtected('AGENTS.md')).toBe(true);
      expect(svc.isProtected('.github/workflows/ci-cd.yml')).toBe(true);
    });

    it('isProtected returns false for non-protected file', () => {
      expect(svc.isProtected('backend/src/kloel/evol/gap.detector.ts')).toBe(false);
      expect(svc.isProtected('README.md')).toBe(false);
    });

    it('classifies eslint config as codacy_weakening', () => {
      const violation = svc.check('backend/eslint.config.mjs', 'test-agent');
      expect(violation).not.toBeNull();
      expect(violation!.violationKind).toBe('codacy_weakening');
    });

    it('classifies husky pre-push as bypass_suppression', () => {
      const violation = svc.check('.husky/pre-push', 'test-agent');
      expect(violation).not.toBeNull();
      expect(violation!.violationKind).toBe('bypass_suppression');
    });

    it('tracks violation count', () => {
      svc.check('CLAUDE.md', 'agent-1');
      svc.check('AGENTS.md', 'agent-2');
      expect(svc.violationCount()).toBe(2);
    });

    it('lists recent violations within time window', () => {
      svc.check('CODEX.md', 'agent-1');
      expect(svc.recentViolations(3600000)).toHaveLength(1);
      expect(svc.recentViolations(-1)).toHaveLength(0);
    });
  });

  describe('CodacyRigorEnforcer (EVOL-009)', () => {
    const svc = new CodacyRigorEnforcer();

    beforeEach(() => svc.reset());

    it('captures baseline from initial check', () => {
      const result = svc.check({ eslint: true, biome: true, semgrep: true });
      expect(result.status).toBe('compliant');
      expect(result.violations).toHaveLength(0);
    });

    it('detects tool disabled (degraded)', () => {
      svc.captureBaseline({ eslint: true, biome: true, semgrep: true });
      const result = svc.check({ eslint: false, biome: true, semgrep: true });
      expect(result.status).toBe('degraded');
      expect(result.violations).toContain('eslint');
    });

    it('detects multiple tools disabled (violated)', () => {
      svc.captureBaseline({ eslint: true, biome: true, semgrep: true, pmd: true });
      const result = svc.check({ eslint: false, biome: false, semgrep: false, pmd: true });
      expect(result.status).toBe('violated');
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });

    it('isCompliant returns true when no violations', () => {
      svc.check({ eslint: true, biome: true, semgrep: true });
      expect(svc.isCompliant()).toBe(true);
    });

    it('isCompliant returns false when violations exist', () => {
      svc.captureBaseline({ eslint: true, biome: true });
      svc.check({ eslint: false, biome: true });
      expect(svc.isCompliant()).toBe(false);
    });

    it('retrieves baseline', () => {
      svc.captureBaseline({ eslint: true, biome: false });
      const baseline = svc.getBaseline();
      expect(baseline.eslint).toBe(true);
      expect(baseline.biome).toBe(false);
    });
  });

  describe('EvolutionAuditLog (EVOL-010)', () => {
    const svc = new EvolutionAuditLog();

    beforeEach(() => svc.reset());

    it('records generic audit entry', () => {
      const entry = svc.record('ws-1', 'test_action', 'test_actor', {}, 'corr-1');
      expect(entry.workspaceId).toBe('ws-1');
      expect(entry.action).toBe('test_action');
      expect(entry.actor).toBe('test_actor');
    });

    it('records gap detection', () => {
      const entry = svc.recordGapDetection('gap-1', 'ws-1', 'corr-1');
      expect(entry.action).toBe('gap_detected');
      expect(entry.actor).toBe('GapDetector');
    });

    it('records proposal created', () => {
      const entry = svc.recordProposalCreated('prop-1', 'ws-1', 'corr-1');
      expect(entry.action).toBe('proposal_created');
    });

    it('records authorization events', () => {
      const entry = svc.recordAuthorization('auth-1', 'approved', 'ws-1', 'corr-1');
      expect(entry.action).toBe('authorization_approved');
    });

    it('records dispatch events', () => {
      const entry = svc.recordDispatch('bridge-1', 'ws-1', 'corr-1', 'auth-1');
      expect(entry.actor).toBe('AgentOrchestrationBridge');
      expect(entry.authorizationId).toBe('auth-1');
    });

    it('filters entries by workspace', () => {
      svc.record('ws-1', 'action_a', 'actor', {}, 'corr-1');
      svc.record('ws-2', 'action_b', 'actor', {}, 'corr-2');
      expect(svc.list('ws-1')).toHaveLength(1);
      expect(svc.list()).toHaveLength(2);
    });

    it('filters entries by recency', () => {
      svc.record('ws-1', 'action', 'actor', {}, 'corr-1');
      expect(svc.recentEntries(3600000)).toHaveLength(1);
      expect(svc.recentEntries(-1)).toHaveLength(0);
    });

    it('counts all entries', () => {
      svc.record('ws-1', 'a', 'actor', {}, 'c1');
      svc.record('ws-2', 'b', 'actor', {}, 'c2');
      expect(svc.count()).toBe(2);
    });
  });
});
