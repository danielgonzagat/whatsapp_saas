/**
 * Proves Step 5 (canonical) of the predictive-coding cycle: when a prediction is
 * evaluated, its correctness is fed into MindBeliefService as a durable Beta
 * belief keyed by (subject='mind:prediction:calibration', predicate). The feed is
 * @Optional + fire-and-forget, so the cycle still runs when belief is absent.
 */
import { MindPredictionService } from './mind-prediction.service';

type Row = {
  intent: string;
  action: string;
  status: string;
  meta: unknown;
  createdAt: string;
};

function row(intent: string, createdAt: string): Row {
  return { intent, action: intent, status: 'executed', meta: {}, createdAt };
}

function makePrisma(cycleRows: Row[][]) {
  let call = 0;
  return {
    $queryRawUnsafe: jest.fn().mockImplementation(() => {
      const rows = cycleRows[Math.min(call, cycleRows.length - 1)] ?? [];
      call += 1;
      return Promise.resolve(rows);
    }),
    autopilotEvent: { create: jest.fn().mockResolvedValue({ id: 'ae' }) },
  };
}

describe('MindPredictionService — canonical belief feed (Step 5)', () => {
  const PAST = '2020-01-01T00:00:00.000Z';
  const FUTURE = '2999-01-01T00:00:00.000Z';

  it('feeds prediction correctness into MindBeliefService on evaluation', async () => {
    // Cycle 1: 3× lead_created → generates pattern_lead_created_continues.
    // Cycle 2: future-dated lead_created rows confirm it → wasCorrect → belief(1).
    const prisma = makePrisma([
      [row('lead_created', PAST), row('lead_created', PAST), row('lead_created', PAST)],
      [row('lead_created', FUTURE), row('lead_created', FUTURE), row('lead_created', FUTURE)],
    ]);
    const belief = { observeBinary: jest.fn().mockResolvedValue({ id: 'b' }) };
    const service = new MindPredictionService(prisma as never, belief as never);

    await service.runCycle('ws-1'); // generate
    await service.runCycle('ws-1'); // evaluate → feed

    expect(belief.observeBinary).toHaveBeenCalledWith(
      'ws-1',
      'mind:prediction:calibration',
      'pattern_lead_created_continues',
      { predicate: 'pattern_lead_created_continues' },
      1,
    );
  });

  it('runs the cycle without throwing when MindBeliefService is absent', async () => {
    const prisma = makePrisma([
      [row('lead_created', PAST), row('lead_created', PAST), row('lead_created', PAST)],
      [row('lead_created', FUTURE), row('lead_created', FUTURE), row('lead_created', FUTURE)],
    ]);
    const service = new MindPredictionService(prisma as never);

    await service.runCycle('ws-1');
    await expect(service.runCycle('ws-1')).resolves.toBeDefined();
  });
});
