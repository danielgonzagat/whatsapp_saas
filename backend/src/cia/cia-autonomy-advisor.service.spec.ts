import { Test, TestingModule } from '@nestjs/testing';
import { CiaAutonomyAdvisorService } from './cia-autonomy-advisor.service';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
type ClosedRow = {
  id: string;
  workspaceId: string;
  decisionType: string;
  chosenAction: string;
  baselineAction: string | null;
  outcomeKey: string;
  expectedWindow: number;
  contextSnapshot: unknown;
  outcomeAt: Date | null;
  outcomeName: string | null;
  outcomeValue: unknown;
  economicValue: number | null;
  wonVsBaseline: boolean | null;
  createdAt: Date;
};

function row(overrides: Partial<ClosedRow> = {}): ClosedRow {
  return {
    id: 'do-1',
    workspaceId: 'ws-1',
    decisionType: 'followup_timing',
    chosenAction: 'send_now',
    baselineAction: 'delay_24h',
    outcomeKey: 'k1',
    expectedWindow: 24,
    contextSnapshot: { channel: 'whatsapp' },
    outcomeAt: new Date(),
    outcomeName: 'payment.succeeded',
    outcomeValue: null,
    economicValue: 99.9,
    wonVsBaseline: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildRows(
  decisionType: string,
  count: number,
  successOutcomeName: string,
  failOutcomeName: string,
  successFraction: number,
): ClosedRow[] {
  const successes = Math.round(count * successFraction);
  const failures = count - successes;
  const rows: ClosedRow[] = [];
  for (let i = 0; i < successes; i++) {
    rows.push(
      row({
        id: `${decisionType}-s-${i}`,
        decisionType,
        outcomeKey: `${decisionType}-s-${i}`,
        outcomeName: successOutcomeName,
      }),
    );
  }
  for (let i = 0; i < failures; i++) {
    rows.push(
      row({
        id: `${decisionType}-f-${i}`,
        decisionType,
        outcomeKey: `${decisionType}-f-${i}`,
        outcomeName: failOutcomeName,
        wonVsBaseline: false,
      }),
    );
  }
  return rows;
}
describe('CiaAutonomyAdvisorService', () => {
  let service: CiaAutonomyAdvisorService;
  let decisionOutcome: { findAllClosedSinceForWorkspace: jest.Mock };

  beforeEach(async () => {
    decisionOutcome = {
      findAllClosedSinceForWorkspace: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiaAutonomyAdvisorService,
        {
          provide: DecisionOutcomeService,
          useValue: decisionOutcome,
        },
      ],
    }).compile();

    service = module.get(CiaAutonomyAdvisorService);
  });
  it('returns zero adjustments when no closed outcomes exist', async () => {
    decisionOutcome.findAllClosedSinceForWorkspace.mockResolvedValue([]);

    const result = await service.analyzeAndAdvise('ws-1');

    expect(result.adjustments).toBe(0);
    expect(result.reasoning).toEqual([]);
  });
  it('skips decision types with fewer than 30 samples', async () => {
    const rows = buildRows('sparse_type', 29, 'payment.succeeded', 'inbound.silent_24h', 0.9);
    decisionOutcome.findAllClosedSinceForWorkspace.mockResolvedValue(rows);

    const result = await service.analyzeAndAdvise('ws-1');

    expect(result.adjustments).toBe(0);
    expect(result.reasoning).toEqual([]);
  });
  it('returns 2 adjustments with reasoning for mixed decision types', async () => {
    // Type A: 90% success, n=50 → z >> 1.96 → INCREASE
    const posRows = buildRows(
      'followup_timing',
      50,
      'payment.succeeded',
      'inbound.silent_24h',
      0.9,
    );
    // Type B: 10% success, n=50 → z << -1.96 → DECREASE
    const negRows = buildRows(
      'coupon_offer',
      50,
      'payment.succeeded',
      'inbound.silent_24h',
      0.1,
    );
    // Type C: only 10 samples → skipped
    const sparseRows = buildRows(
      'product_offer',
      10,
      'payment.succeeded',
      'inbound.silent_24h',
      0.5,
    );

    decisionOutcome.findAllClosedSinceForWorkspace.mockResolvedValue([
      ...posRows,
      ...negRows,
      ...sparseRows,
    ]);

    const result = await service.analyzeAndAdvise('ws-1');

    expect(result.adjustments).toBe(2);
    expect(result.reasoning).toHaveLength(2);

    const increase = result.reasoning.find((r) => r.startsWith('INCREASE'));
    const decrease = result.reasoning.find((r) => r.startsWith('DECREASE'));

    expect(increase).toBeDefined();
    expect(increase).toContain('followup_timing');
    expect(decrease).toBeDefined();
    expect(decrease).toContain('coupon_offer');
  });
  it('returns NO_CHANGE for non-significant result (z in (-1.96, 1.96))', async () => {
    // 55% success, n=30 → z ≈ 0.548 (not significant)
    const rows = buildRows(
      'neutral_type',
      30,
      'payment.succeeded',
      'inbound.silent_24h',
      0.55,
    );
    decisionOutcome.findAllClosedSinceForWorkspace.mockResolvedValue(rows);

    const result = await service.analyzeAndAdvise('ws-1');

    expect(result.adjustments).toBe(0);
    expect(result.reasoning).toHaveLength(1);
    expect(result.reasoning[0]).toContain('NO_CHANGE');
    expect(result.reasoning[0]).toContain('not significant');
  });
  it('correctly computes z-statistic for known proportions', async () => {
    // 90% success, n=100 → p̂ = 0.9, SE = sqrt(0.25/100) = 0.05, z = 0.4/0.05 = 8.0
    const rows = buildRows(
      'strong_type',
      100,
      'payment.succeeded',
      'inbound.silent_24h',
      0.9,
    );
    decisionOutcome.findAllClosedSinceForWorkspace.mockResolvedValue(rows);

    const result = await service.analyzeAndAdvise('ws-1');

    expect(result.adjustments).toBe(1);
    expect(result.reasoning[0]).toMatch(/z=8\.\d+/);
  });
  it('counts coupon.redeemed and conversation.handed_off as successes', async () => {
    const rows: ClosedRow[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push(
        row({
          id: `coupon-${i}`,
          decisionType: 'coupon_offer',
          outcomeKey: `coupon-${i}`,
          outcomeName: 'coupon.redeemed',
        }),
      );
    }
    decisionOutcome.findAllClosedSinceForWorkspace.mockResolvedValue(rows);

    const result = await service.analyzeAndAdvise('ws-1');

    expect(result.adjustments).toBe(1);
    expect(result.reasoning[0]).toContain('INCREASE');
    expect(result.reasoning[0]).toContain('100.0%');
  });
