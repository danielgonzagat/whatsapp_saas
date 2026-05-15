import { assessPortfolio } from './portfolio-assessment';
import { bundleClientContext } from './client-context-bundle';
import { rankPriorities } from './priority.ranker';
import { trackMargin } from './margin-per-client.tracker';
import { detectChurnRisk } from './churn-risk-per-client.detector';
import { balanceLoad } from './team-load-balancer';
import { guardKnowledgeLeak } from './internal-knowledge-leak.guard';
import { createHandoff } from './handoff.service';
import type {
  BundleInput,
  ClientContextBundle,
  ChurnInput,
  HandoffInput,
  LeakGuardInput,
  LoadInput,
  MarginInput,
  PortfolioInput,
  PriorityInput,
  TeamMemberInput,
} from './types';
import { clamp, clampScore, daysSince } from './types';

const NOW = Date.parse('2026-05-14T12:00:00.000Z');
const WKS = 'wks_agency_test';

function makeBundle(over: Partial<BundleInput> = {}): ClientContextBundle {
  const input: BundleInput = {
    clientId: over.clientId ?? 'client_001',
    workspaceId: over.workspaceId ?? WKS,
    clientName: over.clientName ?? 'Cliente Teste',
    relationshipAgeDays: over.relationshipAgeDays ?? 180,
    activeProjects: over.activeProjects ?? 3,
    monthlyRevenueCents: over.monthlyRevenueCents ?? 50_000n,
    lastContactAt: over.lastContactAt ?? new Date(NOW - 3 * 24 * 3600_000).toISOString(),
    openIssues: over.openIssues ?? 1,
    satisfactionScore: over.satisfactionScore ?? 0.8,
    contractRenewalAt: over.contractRenewalAt ?? undefined,
    nowMs: NOW,
  };
  return bundleClientContext(input).bundle;
}

// =========================================================================
// HELPERS
// =========================================================================
describe('agency helpers', () => {
  it('clamp bounds values between min and max', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
  });

  it('clampScore bounds to 0-1', () => {
    expect(clampScore(0.5)).toBe(0.5);
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(-0.5)).toBe(0);
  });

  it('daysSince computes correct difference', () => {
    const past = new Date(NOW - 48 * 3600_000).toISOString();
    expect(daysSince(past, NOW)).toBe(2);
  });

  it('daysSince returns 0 for invalid dates', () => {
    expect(daysSince('not-a-date', NOW)).toBe(0);
  });
});

// =========================================================================
// AGENCY-001 — Portfolio State
// =========================================================================
describe('AGENCY-001 — assessPortfolio', () => {
  it('returns empty portfolio with zero clients', () => {
    const input: PortfolioInput = { bundles: [], workspaceId: WKS, nowMs: NOW };
    const { state } = assessPortfolio(input);
    expect(state.totalClients).toBe(0);
    expect(state.healthScore).toBe(0);
  });

  it('classifies clients by recency', () => {
    const recent = makeBundle({
      clientId: 'c1',
      lastContactAt: new Date(NOW - 3 * 24 * 3600_000).toISOString(),
    });
    const atRisk = makeBundle({
      clientId: 'c2',
      lastContactAt: new Date(NOW - 20 * 24 * 3600_000).toISOString(),
    });
    const critical = makeBundle({
      clientId: 'c3',
      lastContactAt: new Date(NOW - 35 * 24 * 3600_000).toISOString(),
    });

    const input: PortfolioInput = {
      bundles: [recent, atRisk, critical],
      workspaceId: WKS,
      nowMs: NOW,
    };
    const { state } = assessPortfolio(input);

    expect(state.totalClients).toBe(3);
    expect(state.activeClients).toBe(1);
    expect(state.atRiskClients).toBe(1);
    expect(state.criticalClients).toBe(1);
  });

  it('computes total revenue correctly', () => {
    const b1 = makeBundle({ clientId: 'c1', monthlyRevenueCents: 100_000n });
    const b2 = makeBundle({ clientId: 'c2', monthlyRevenueCents: 200_000n });

    const input: PortfolioInput = { bundles: [b1, b2], workspaceId: WKS, nowMs: NOW };
    const { state } = assessPortfolio(input);

    expect(state.totalMonthlyRevenueCents).toBe(300_000n);
  });

  it('generates summary text for critical clients', () => {
    const critical = makeBundle({
      clientId: 'c1',
      lastContactAt: new Date(NOW - 35 * 24 * 3600_000).toISOString(),
    });
    const input: PortfolioInput = { bundles: [critical], workspaceId: WKS, nowMs: NOW };
    const { summary } = assessPortfolio(input);
    expect(summary).toContain('critico');
  });
});

// =========================================================================
// AGENCY-002 — Per-Client Context Bundler
// =========================================================================
describe('AGENCY-002 — bundleClientContext', () => {
  it('bundles input into structured context', () => {
    const input: BundleInput = {
      clientId: 'client_002',
      workspaceId: WKS,
      clientName: 'Acme Corp',
      relationshipAgeDays: 365,
      activeProjects: 4,
      monthlyRevenueCents: 200_000n,
      lastContactAt: new Date(NOW - 5 * 24 * 3600_000).toISOString(),
      openIssues: 2,
      satisfactionScore: 0.9,
      contractRenewalAt: new Date(NOW + 60 * 24 * 3600_000).toISOString(),
      nowMs: NOW,
    };
    const { bundle } = bundleClientContext(input);
    expect(bundle.clientId).toBe('client_002');
    expect(bundle.clientName).toBe('Acme Corp');
    expect(bundle.monthlyRevenueCents).toBe(200_000n);
    expect(bundle.satisfactionScore).toBe(0.9);
  });

  it('infers high_value tag for large revenue', () => {
    const input: BundleInput = {
      clientId: 'c1',
      workspaceId: WKS,
      clientName: 'Big Co',
      relationshipAgeDays: 100,
      activeProjects: 2,
      monthlyRevenueCents: 500_000n,
      lastContactAt: new Date(NOW - 1 * 24 * 3600_000).toISOString(),
      openIssues: 0,
      satisfactionScore: 1,
      nowMs: NOW,
    };
    const { bundle } = bundleClientContext(input);
    expect(bundle.tags).toContain('high_value');
  });

  it('infers new_client tag for recent relationship', () => {
    const input: BundleInput = {
      clientId: 'c2',
      workspaceId: WKS,
      clientName: 'New Co',
      relationshipAgeDays: 30,
      activeProjects: 1,
      monthlyRevenueCents: 10_000n,
      lastContactAt: new Date(NOW - 1 * 24 * 3600_000).toISOString(),
      openIssues: 0,
      satisfactionScore: 1,
      nowMs: NOW,
    };
    const { bundle } = bundleClientContext(input);
    expect(bundle.tags).toContain('new_client');
  });
});

// =========================================================================
// AGENCY-003 — Priority Ranker
// =========================================================================
describe('AGENCY-003 — rankPriorities', () => {
  it('returns empty rankings for no clients', () => {
    const input: PriorityInput = { bundles: [], workspaceId: WKS, nowMs: NOW };
    const { rankings, topClient } = rankPriorities(input);
    expect(rankings).toHaveLength(0);
    expect(topClient).toBeNull();
  });

  it('ranks clients by priority score', () => {
    const high = makeBundle({
      clientId: 'high',
      monthlyRevenueCents: 500_000n,
      satisfactionScore: 1,
      openIssues: 0,
    });
    const low = makeBundle({
      clientId: 'low',
      monthlyRevenueCents: 1_000n,
      satisfactionScore: 0.2,
      openIssues: 10,
    });

    const input: PriorityInput = { bundles: [low, high], workspaceId: WKS, nowMs: NOW };
    const { rankings } = rankPriorities(input);

    expect(rankings).toHaveLength(2);
    expect(rankings[0]!.clientId).toBe('high');
    expect(rankings[0]!.rank).toBe(1);
    expect(rankings[1]!.clientId).toBe('low');
    expect(rankings[1]!.rank).toBe(2);
  });

  it('assigns higher tier to high-scoring clients', () => {
    const high = makeBundle({
      clientId: 'h',
      monthlyRevenueCents: 500_000n,
      satisfactionScore: 1,
      openIssues: 0,
    });
    const input: PriorityInput = { bundles: [high], workspaceId: WKS, nowMs: NOW };
    const { rankings } = rankPriorities(input);
    expect(rankings[0]!.tier).toBe('agora');
  });
});

// =========================================================================
// AGENCY-004 — Margin Per Client Tracker
// =========================================================================
describe('AGENCY-004 — trackMargin', () => {
  it('computes profit margin correctly', () => {
    const input: MarginInput = {
      clientId: 'c1',
      workspaceId: WKS,
      revenueCents: 100_000n,
      costCents: 30_000n,
      nowMs: NOW,
    };
    const { margin, profitable } = trackMargin(input);
    expect(margin.marginCents).toBe(70_000n);
    expect(margin.marginPercent).toBe(70);
    expect(profitable).toBe(true);
  });

  it('detects negative margin', () => {
    const input: MarginInput = {
      clientId: 'c1',
      workspaceId: WKS,
      revenueCents: 50_000n,
      costCents: 80_000n,
      nowMs: NOW,
    };
    const { margin, profitable } = trackMargin(input);
    expect(margin.marginCents).toBe(-30_000n);
    expect(profitable).toBe(false);
  });

  it('tracks improving trend from previous margin', () => {
    const input: MarginInput = {
      clientId: 'c1',
      workspaceId: WKS,
      revenueCents: 100_000n,
      costCents: 20_000n,
      previousMarginPercent: 60,
      nowMs: NOW,
    };
    const { margin } = trackMargin(input);
    expect(margin.marginPercent).toBe(80);
    expect(margin.trend).toBe('improving');
  });
});

// =========================================================================
// AGENCY-005 — Churn Risk Per Client Detector
// =========================================================================
describe('AGENCY-005 — detectChurnRisk', () => {
  it('returns low risk for healthy client', () => {
    const bundle = makeBundle({ clientId: 'c1', satisfactionScore: 1, openIssues: 0 });
    const input: ChurnInput = {
      bundle,
      recentContactDays: 1,
      delayedPayment: false,
      complaintCount: 0,
      scopeReduction: false,
      nowMs: NOW,
    };
    const { assessment, requiresAction } = detectChurnRisk(input);
    expect(assessment.riskLevel).toBe('low');
    expect(requiresAction).toBe(false);
  });

  it('returns critical risk with multiple signals', () => {
    const bundle = makeBundle({
      clientId: 'c1',
      satisfactionScore: 0.1,
      contractRenewalAt: new Date(NOW - 5 * 24 * 3600_000).toISOString(),
    });
    const input: ChurnInput = {
      bundle,
      recentContactDays: 35,
      delayedPayment: true,
      complaintCount: 4,
      scopeReduction: true,
      nowMs: NOW,
    };
    const { assessment, requiresAction } = detectChurnRisk(input);
    expect(assessment.riskLevel).toBe('critical');
    expect(assessment.riskProbability).toBeGreaterThanOrEqual(0.7);
    expect(requiresAction).toBe(true);
  });
});

// =========================================================================
// AGENCY-006 — Team Load Balancer
// =========================================================================
describe('AGENCY-006 — balanceLoad', () => {
  it('identifies overworked members', () => {
    const members: readonly TeamMemberInput[] = [
      { memberId: 'm1', memberName: 'Alice', maxCapacity: 5 },
    ];
    const b1 = makeBundle({ clientId: 'c1' });
    const b2 = makeBundle({ clientId: 'c2' });
    const b3 = makeBundle({ clientId: 'c3' });
    const b4 = makeBundle({ clientId: 'c4' });
    const b5 = makeBundle({ clientId: 'c5' });

    const input: LoadInput = {
      workspaceId: WKS,
      members,
      bundles: [b1, b2, b3, b4, b5],
      assignments: { m1: ['c1', 'c2', 'c3', 'c4', 'c5'] },
      nowMs: NOW,
    };
    const { balance, needsRebalance } = balanceLoad(input);
    expect(balance.overworkedMembers).toContain('m1');
    expect(needsRebalance).toBe(true);
  });

  it('returns balanced when load is in healthy range', () => {
    const members: readonly TeamMemberInput[] = [
      { memberId: 'm1', memberName: 'Bob', maxCapacity: 10 },
    ];
    const b1 = makeBundle({ clientId: 'c1' });
    const b2 = makeBundle({ clientId: 'c2' });
    const b3 = makeBundle({ clientId: 'c3' });
    const b4 = makeBundle({ clientId: 'c4' });
    const b5 = makeBundle({ clientId: 'c5' });
    const b6 = makeBundle({ clientId: 'c6' });

    const input: LoadInput = {
      workspaceId: WKS,
      members,
      bundles: [b1, b2, b3, b4, b5, b6],
      assignments: { m1: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] },
      nowMs: NOW,
    };
    const { balance, needsRebalance } = balanceLoad(input);
    expect(balance.overworkedMembers).toHaveLength(0);
    expect(needsRebalance).toBe(false);
  });
});

// =========================================================================
// AGENCY-007 — Internal Knowledge Leak Guard
// =========================================================================
describe('AGENCY-007 — guardKnowledgeLeak', () => {
  it('detects no leaks with single client', () => {
    const b1 = makeBundle({ clientId: 'c1' });
    const input: LeakGuardInput = { workspaceId: WKS, bundles: [b1], nowMs: NOW };
    const { leak, safe } = guardKnowledgeLeak(input);
    expect(leak.leakDetected).toBe(false);
    expect(safe).toBe(true);
  });

  it('detects no leaks with distinct clients', () => {
    const b1 = makeBundle({
      clientId: 'c1',
      clientName: 'Acme',
      monthlyRevenueCents: 50_000n,
      openIssues: 0,
      satisfactionScore: 0.9,
    });
    const b2 = makeBundle({
      clientId: 'c2',
      clientName: 'Beta',
      monthlyRevenueCents: 100_000n,
      openIssues: 3,
      satisfactionScore: 0.7,
    });
    const input: LeakGuardInput = { workspaceId: WKS, bundles: [b1, b2], nowMs: NOW };
    const { leak, safe } = guardKnowledgeLeak(input);
    expect(leak.leakDetected).toBe(false);
    expect(safe).toBe(true);
  });

  it('detects leak when clientName is identical across clients', () => {
    const b1 = makeBundle({ clientId: 'c1', clientName: 'SameName' });
    const b2 = makeBundle({ clientId: 'c2', clientName: 'SameName' });
    const input: LeakGuardInput = { workspaceId: WKS, bundles: [b1, b2], nowMs: NOW };
    const { leak, safe } = guardKnowledgeLeak(input);
    expect(leak.leakDetected).toBe(true);
    expect(safe).toBe(false);
    expect(leak.affectedBundles.length).toBeGreaterThan(0);
  });

  it('detects leak when revenue matches across clients', () => {
    const sameRevenue = 75_000n;
    const b1 = makeBundle({ clientId: 'c1', clientName: 'Acme', monthlyRevenueCents: sameRevenue });
    const b2 = makeBundle({ clientId: 'c2', clientName: 'Beta', monthlyRevenueCents: sameRevenue });
    const input: LeakGuardInput = { workspaceId: WKS, bundles: [b1, b2], nowMs: NOW };
    const { leak, safe } = guardKnowledgeLeak(input);
    expect(leak.leakDetected).toBe(true);
    expect(safe).toBe(false);
  });
});

// =========================================================================
// AGENCY-008 — Handoff Service
// =========================================================================
describe('AGENCY-008 — createHandoff', () => {
  it('creates ready-to-deliver handoff with all fields', () => {
    const bundle = makeBundle({ clientId: 'c1' });
    const input: HandoffInput = {
      fromMemberId: 'm1',
      toMemberId: 'm2',
      clientId: 'c1',
      workspaceId: WKS,
      urgency: 'this_week',
      note: 'Transferindo para especialista em e-commerce.',
      bundle,
      priority: null,
      margin: null,
      churnRisk: null,
      createdBy: 'admin',
      nowMs: NOW,
    };
    const { handoff, readyToDeliver } = createHandoff(input);
    expect(handoff.handoffId).toMatch(/^handoff_/);
    expect(handoff.fromMemberId).toBe('m1');
    expect(handoff.toMemberId).toBe('m2');
    expect(handoff.urgency).toBe('this_week');
    expect(readyToDeliver).toBe(true);
  });

  it('flags self-handoff as not ready', () => {
    const bundle = makeBundle({ clientId: 'c1' });
    const input: HandoffInput = {
      fromMemberId: 'm1',
      toMemberId: 'm1',
      clientId: 'c1',
      workspaceId: WKS,
      urgency: 'this_week',
      note: 'Self-handoff',
      bundle,
      priority: null,
      margin: null,
      churnRisk: null,
      createdBy: 'admin',
      nowMs: NOW,
    };
    const { handoff, readyToDeliver } = createHandoff(input);
    expect(readyToDeliver).toBe(false);
    expect(handoff.handoffNote).toContain('self_handoff');
  });

  it('flags urgent handoff without recipient', () => {
    const bundle = makeBundle({ clientId: 'c1' });
    const input: HandoffInput = {
      fromMemberId: 'm1',
      toMemberId: null,
      clientId: 'c1',
      workspaceId: WKS,
      urgency: 'now',
      note: 'Urgente!',
      bundle,
      priority: null,
      margin: null,
      churnRisk: null,
      createdBy: 'admin',
      nowMs: NOW,
    };
    const { readyToDeliver } = createHandoff(input);
    expect(readyToDeliver).toBe(false);
  });
});
