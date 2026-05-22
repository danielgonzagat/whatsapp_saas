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
