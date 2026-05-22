import { PortfolioStateService } from './portfolio-state.service';
import { PerClientContextBundler } from './per-client-context.bundler';
import type {
  BundleBuildInput,
  ClientData,
  ConsolidationInput,
  TeamMemberData,
} from './portfolio-state.service';
import type { ClientContextBundle } from './agency.types';
import { clamp, clampScore } from './agency.types';

const NOW = Date.parse('2026-05-14T12:00:00.000Z');
const AGENCY = 'agency_001';

function makeData(
  workspaceId: string,
  overrides: Partial<ClientData> = {},
): ClientData {
  return {
    workspaceId,
    revenueCents: overrides.revenueCents ?? 100_000n,
    costCents: overrides.costCents ?? 30_000n,
    previousMarginPercent: overrides.previousMarginPercent,
    satisfactionScore: overrides.satisfactionScore ?? 0.8,
    openIssues: overrides.openIssues ?? 1,
    activeProjects: overrides.activeProjects ?? 3,
    relationshipDays: overrides.relationshipDays ?? 180,
    lastContactDaysAgo: overrides.lastContactDaysAgo ?? 3,
    delayedPayment: overrides.delayedPayment ?? false,
    complaintCount: overrides.complaintCount ?? 0,
    scopeReduction: overrides.scopeReduction ?? false,
    contractRenewalAt: overrides.contractRenewalAt ?? null,
  };
}

function makeBundleInput(
  clientId: string,
  overrides: Partial<BundleBuildInput> = {},
): BundleBuildInput {
  return {
    agencyWorkspaceId: overrides.agencyWorkspaceId ?? AGENCY,
    clientWorkspaceId: clientId,
    activeProjects: overrides.activeProjects ?? 3,
    openIssues: overrides.openIssues ?? 1,
    satisfactionScore: overrides.satisfactionScore ?? 0.8,
    revenueCents: overrides.revenueCents ?? 100_000n,
    relationshipDays: overrides.relationshipDays ?? 180,
    contractRenewalAt: overrides.contractRenewalAt ?? null,
    tags: overrides.tags,
    nowMs: overrides.nowMs ?? NOW,
  };
}

// =========================================================================
// HELPERS
// =========================================================================
describe('agency helpers', () => {
  it('clamp bounds values between min and max', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(-0.5, 0, 1)).toBe(0);
  });

  it('clampScore bounds to 0-1', () => {
    expect(clampScore(0.75)).toBe(0.75);
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(-0.2)).toBe(0);
  });
});

// =========================================================================
// AGENCY-009 — PortfolioStateService
// =========================================================================
describe('AGENCY-009 — PortfolioStateService', () => {
  const svc = new PortfolioStateService();

  it('returns empty state for zero clients', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [],
      nowMs: NOW,
    };
    const { state, summary } = svc.consolidate(input);

    expect(state.clientCount).toBe(0);
    expect(state.marginPerClient).toHaveLength(0);
    expect(state.churnRiskPerClient).toHaveLength(0);
    expect(state.priorityRanking).toHaveLength(0);
    expect(state.teamLoad).toBeNull();
    expect(summary).toBe('No clients in portfolio.');
  });

  it('consolidates single client with margin correctly', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01', { revenueCents: 200_000n, costCents: 50_000n }),
      ],
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.clientCount).toBe(1);
    expect(state.marginPerClient).toHaveLength(1);
    expect(state.marginPerClient[0]!.marginCents).toBe(150_000n);
    expect(state.marginPerClient[0]!.marginPercent).toBe(75);
    expect(state.marginPerClient[0]!.trend).toBe('stable');
  });

  it('detects improving margin trend from previous', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01', {
          revenueCents: 200_000n,
          costCents: 20_000n,
          previousMarginPercent: 50,
        }),
      ],
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.marginPerClient[0]!.marginPercent).toBe(90);
    expect(state.marginPerClient[0]!.trend).toBe('improving');
  });

  it('detects declining margin trend from previous', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01', {
          revenueCents: 100_000n,
          costCents: 90_000n,
          previousMarginPercent: 80,
        }),
      ],
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.marginPerClient[0]!.marginPercent).toBe(10);
    expect(state.marginPerClient[0]!.trend).toBe('declining');
  });

  it('classifies churn risk as low for healthy client', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01', {
          satisfactionScore: 1,
          openIssues: 0,
          lastContactDaysAgo: 1,
        }),
      ],
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.churnRiskPerClient[0]!.riskLevel).toBe('low');
    expect(state.churnRiskPerClient[0]!.signals).toContain('no_signals');
  });

  it('classifies churn risk as critical with multiple signals', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01', {
          satisfactionScore: 0.1,
          lastContactDaysAgo: 35,
          delayedPayment: true,
          complaintCount: 4,
          scopeReduction: true,
        }),
      ],
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.churnRiskPerClient[0]!.riskLevel).toBe('critical');
    expect(state.churnRiskPerClient[0]!.riskProbability).toBeGreaterThanOrEqual(
      0.7,
    );
    expect(state.churnRiskPerClient[0]!.signals).toContain('delayed_payment');
    expect(state.churnRiskPerClient[0]!.signals).toContain('no_recent_contact');
  });

  it('ranks clients by priority score descending', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_low', {
          revenueCents: 1_000n,
          satisfactionScore: 0.2,
          openIssues: 10,
          lastContactDaysAgo: 25,
        }),
        makeData('wks_high', {
          revenueCents: 500_000n,
          satisfactionScore: 1,
          openIssues: 0,
          lastContactDaysAgo: 1,
        }),
      ],
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.priorityRanking).toHaveLength(2);
    expect(state.priorityRanking[0]!.clientWorkspaceId).toBe('wks_high');
    expect(state.priorityRanking[0]!.rank).toBe(1);
    expect(state.priorityRanking[1]!.clientWorkspaceId).toBe('wks_low');
    expect(state.priorityRanking[1]!.rank).toBe(2);
  });

  it('assigns higher priority tier to high-scoring clients', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_top', {
          revenueCents: 500_000n,
          satisfactionScore: 1,
          openIssues: 0,
          lastContactDaysAgo: 1,
        }),
      ],
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.priorityRanking[0]!.tier).toBe('agora');
    expect(state.priorityRanking[0]!.drivers).toContain('sustained_health');
  });

  it('builds team load summary for balanced team', () => {
    const members: readonly TeamMemberData[] = [
      {
        memberId: 'm1',
        memberName: 'Alice',
        maxCapacity: 10,
        assignedClientIds: ['wks_01', 'wks_02', 'wks_03'],
      },
    ];
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01'),
        makeData('wks_02'),
        makeData('wks_03'),
      ],
      teamMembers: members,
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.teamLoad).not.toBeNull();
    expect(state.teamLoad!.overworkedCount).toBe(0);
    expect(state.teamLoad!.underutilizedCount).toBe(0);
  });

  it('detects overworked team members', () => {
    const members: readonly TeamMemberData[] = [
      {
        memberId: 'm1',
        memberName: 'Bob',
        maxCapacity: 5,
        assignedClientIds: ['wks_01', 'wks_02', 'wks_03', 'wks_04', 'wks_05'],
      },
    ];
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01'),
        makeData('wks_02'),
        makeData('wks_03'),
        makeData('wks_04'),
        makeData('wks_05'),
      ],
      teamMembers: members,
      nowMs: NOW,
    };
    const { state } = svc.consolidate(input);

    expect(state.teamLoad!.overworkedCount).toBe(1);
    expect(state.teamLoad!.recommendation).toContain('sobrecarregado');
  });

  it('produces summary for critical portfolio', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01', {
          satisfactionScore: 0.1,
          lastContactDaysAgo: 35,
          delayedPayment: true,
          complaintCount: 5,
          scopeReduction: true,
        }),
      ],
      nowMs: NOW,
    };
    const { summary } = svc.consolidate(input);

    expect(summary).toContain('urgente');
  });

  it('produces summary for healthy portfolio', () => {
    const input: ConsolidationInput = {
      agencyWorkspaceId: AGENCY,
      clients: [
        makeData('wks_01', {
          satisfactionScore: 1,
          lastContactDaysAgo: 1,
          revenueCents: 200_000n,
          costCents: 20_000n,
        }),
      ],
      nowMs: NOW,
    };
    const { summary } = svc.consolidate(input);

    expect(summary).toContain('saudavel');
  });
});

// =========================================================================
// AGENCY-010 — PerClientContextBundler
// =========================================================================