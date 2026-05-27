import { PortfolioStateService } from './portfolio-state.service';
import type { ClientData, ConsolidationInput, TeamMemberData } from './portfolio-state.service';

describe('UTP-AGENCY-009 — PortfolioStateService', () => {
  const service = new PortfolioStateService();

  const baseClient = (over?: Partial<ClientData>): ClientData => ({
    workspaceId: 'ws-1',
    revenueCents: 100_00n,
    costCents: 30_00n,
    satisfactionScore: 0.8,
    openIssues: 1,
    activeProjects: 2,
    relationshipDays: 365,
    lastContactDaysAgo: 3,
    delayedPayment: false,
    complaintCount: 0,
    scopeReduction: false,
    contractRenewalAt: null,
    ...over,
  });

  const baseInput = (over?: Partial<ConsolidationInput>): ConsolidationInput => ({
    agencyWorkspaceId: 'ag-1',
    clients: [baseClient()],
    nowMs: Date.parse('2026-05-27T12:00:00.000Z'),
    ...over,
  });

  it('returns empty state when clients array is empty', () => {
    const result = service.consolidate({
      agencyWorkspaceId: 'ag-1',
      clients: [],
    });

    expect(result.state.clientCount).toBe(0);
    expect(result.state.marginPerClient).toEqual([]);
    expect(result.state.churnRiskPerClient).toEqual([]);
    expect(result.state.priorityRanking).toEqual([]);
    expect(result.state.teamLoad).toBeNull();
    expect(result.summary).toBe('No clients in portfolio.');
  });

  it('computes margin snapshot with positive margin', () => {
    const input = baseInput({
      clients: [
        baseClient({ workspaceId: 'ws-m', revenueCents: 100_00n, costCents: 30_00n }),
      ],
    });

    const result = service.consolidate(input);
    const m = result.state.marginPerClient[0]!;

    expect(m.clientWorkspaceId).toBe('ws-m');
    expect(m.marginPercent).toBe(70);
    expect(m.marginCents).toBe(70_00n);
    expect(m.revenueCents).toBe(100_00n);
    expect(m.costCents).toBe(30_00n);
  });

  it('reports zero margin and negative trend when revenue is zero', () => {
    const result = service.consolidate(
      baseInput({
        clients: [baseClient({ revenueCents: 0n, costCents: 10_00n })],
      }),
    );

    const m = result.state.marginPerClient[0]!;
    expect(m.marginPercent).toBe(0);
    expect(m.trend).toBe('negative');
  });

  it('detects improving margin trend vs previous margin', () => {
    const result = service.consolidate(
      baseInput({
        clients: [
          baseClient({
            revenueCents: 100_00n,
            costCents: 10_00n,
            previousMarginPercent: 50,
          }),
        ],
      }),
    );

    expect(result.state.marginPerClient[0]!.trend).toBe('improving');
  });

  it('detects declining margin trend vs previous margin', () => {
    const result = service.consolidate(
      baseInput({
        clients: [
          baseClient({
            revenueCents: 100_00n,
            costCents: 90_00n,
            previousMarginPercent: 80,
          }),
        ],
      }),
    );

    expect(result.state.marginPerClient[0]!.trend).toBe('declining');
  });

  it('marks client as low risk with no signals', () => {
    const result = service.consolidate(
      baseInput({
        clients: [
          baseClient({
            lastContactDaysAgo: 3,
            delayedPayment: false,
            complaintCount: 0,
            scopeReduction: false,
            satisfactionScore: 0.9,
          }),
        ],
      }),
    );

    const c = result.state.churnRiskPerClient[0]!;
    expect(c.riskLevel).toBe('low');
    expect(c.signals).toEqual(['no_signals']);
  });

  it('marks client as critical with stacked risk factors', () => {
    const result = service.consolidate(
      baseInput({
        clients: [
          baseClient({
            lastContactDaysAgo: 35,
            delayedPayment: true,
            complaintCount: 4,
            scopeReduction: true,
            satisfactionScore: 0.1,
          }),
        ],
      }),
    );

    const c = result.state.churnRiskPerClient[0]!;
    expect(c.riskLevel).toBe('critical');
    expect(c.signals).toContain('no_recent_contact');
    expect(c.signals).toContain('delayed_payment');
    expect(c.signals).toContain('scope_reduction');
    expect(c.signals).toContain('low_satisfaction');
  });

  it('ranks multiple clients by priority score descending', () => {
    const result = service.consolidate(
      baseInput({
        clients: [
          baseClient({
            workspaceId: 'ws-low',
            revenueCents: 10_00n,
            lastContactDaysAgo: 60,
            openIssues: 8,
            satisfactionScore: 0.2,
          }),
          baseClient({
            workspaceId: 'ws-high',
            revenueCents: 500_00n,
            lastContactDaysAgo: 1,
            openIssues: 0,
            satisfactionScore: 0.95,
          }),
        ],
      }),
    );

    const ranks = result.state.priorityRanking;
    expect(ranks[0]!.clientWorkspaceId).toBe('ws-high');
    expect(ranks[0]!.rank).toBe(1);
    expect(ranks[1]!.clientWorkspaceId).toBe('ws-low');
  });

  it('returns null team load when no members provided', () => {
    const result = service.consolidate(baseInput({ teamMembers: undefined }));
    expect(result.state.teamLoad).toBeNull();
  });

  it('detects overworked member at max capacity', () => {
    const member: TeamMemberData = {
      memberId: 'm-1',
      memberName: 'Alice',
      maxCapacity: 5,
      assignedClientIds: ['ws-1', 'ws-2', 'ws-3', 'ws-4', 'ws-5'],
    };

    const result = service.consolidate(baseInput({ teamMembers: [member] }));
    expect(result.state.teamLoad!.overworkedCount).toBe(1);
    expect(result.state.teamLoad!.underutilizedCount).toBe(0);
  });

  it('generates critical summary when high-risk clients detected', () => {
    const result = service.consolidate(
      baseInput({
        clients: [
          baseClient({
            lastContactDaysAgo: 35,
            delayedPayment: true,
            complaintCount: 3,
            scopeReduction: true,
            satisfactionScore: 0.1,
          }),
        ],
      }),
    );

    expect(result.summary).toContain('critico');
  });
});
