import {
  MindSelfModificationService,
  SELF_EVOLUTION_CYCLE_BUCKET_HOURS,
  SELF_EVOLUTION_EVENT_TYPE,
} from './mind-self-modification.service';

type AsyncMock<TReturn> = jest.Mock<Promise<TReturn>>;

interface OutboxRow {
  id: string;
  workspaceId: string;
  eventType: string;
  subject: string;
  payload: unknown;
  idempotencyKey: string;
  occurredAt: Date;
}

interface PredictionRow {
  predicate: string;
  surprise: number;
}

/**
 * Build a minimal Prisma surface that the cycle exercises end-to-end:
 *  - mindPrediction.findMany → returns predictions to build a proposal
 *  - mindOutboxEvent.upsert → records the persisted row
 */
function buildFakePrisma(predictions: PredictionRow[] = []) {
  const upserts: OutboxRow[] = [];
  const upsertMock: AsyncMock<{ id: string }> = jest.fn(async (args: unknown) => {
    const { create } = args as { create: OutboxRow };
    upserts.push({ ...create });
    return { id: create.id };
  });
  const findManyMock: AsyncMock<PredictionRow[]> = jest.fn(async () => predictions);

  return {
    prisma: {
      mindPrediction: { findMany: findManyMock },
      mindOutboxEvent: { upsert: upsertMock },
    },
    upserts,
    upsertMock,
    findManyMock,
  };
}

function buildFakeSpine() {
  const emit = jest.fn(async (_envelope: unknown) => ({
    eventId: 'evt_stub',
    eventName: 'stub',
  }));
  return { spine: { emit }, emit };
}

const RECURRENT_PREDICATE = 'P(reply|template,hour)';

function makeRecurrentPredictions(): PredictionRow[] {
  return [
    { predicate: RECURRENT_PREDICATE, surprise: 2.1 },
    { predicate: RECURRENT_PREDICATE, surprise: 1.8 },
    { predicate: RECURRENT_PREDICATE, surprise: 2.5 },
  ];
}

describe('MindSelfModificationService.runEvolutionCycle (full self-evolution cycle)', () => {
  it('proposes -> persists RAC_MindOutboxEvent -> emits spine envelope', async () => {
    const fakePrisma = buildFakePrisma(makeRecurrentPredictions());
    const fakeSpine = buildFakeSpine();

    const service = new MindSelfModificationService(
      fakePrisma.prisma as never,
      fakeSpine.spine as never,
    );
    const result = await service.runEvolutionCycle('ws-cycle-1');

    expect(result.persisted).toBe(true);
    expect(result.eventId).toBeTruthy();
    expect(result.proposal.opportunities.length).toBeGreaterThan(0);

    // (1) Prediction query happened against the right workspace
    expect(fakePrisma.findManyMock).toHaveBeenCalledTimes(1);
    const findCallArgs = (fakePrisma.findManyMock.mock.calls[0] as unknown[])?.[0] as {
      where?: { workspaceId?: string };
    };
    expect(findCallArgs?.where?.workspaceId).toBe('ws-cycle-1');

    // (2) Outbox row was upserted with canonical event type + idempotent key
    expect(fakePrisma.upsertMock).toHaveBeenCalledTimes(1);
    const persisted = fakePrisma.upserts[0];
    expect(persisted).toBeDefined();
    expect(persisted?.workspaceId).toBe('ws-cycle-1');
    expect(persisted?.eventType).toBe(SELF_EVOLUTION_EVENT_TYPE);
    expect(persisted?.subject).toBe('workspace:ws-cycle-1');
    expect(persisted?.idempotencyKey).toContain(SELF_EVOLUTION_EVENT_TYPE);

    // (3) Payload shape carries opportunity count + cycle bucket + sample
    const payload = persisted?.payload as {
      opportunityCount: number;
      opportunities: Array<{ kind: string; rationale: string }>;
      cycleBucket: number;
      source: string;
    };
    expect(payload.opportunityCount).toBe(result.proposal.opportunities.length);
    expect(payload.opportunities.length).toBeGreaterThan(0);
    expect(payload.opportunities[0]?.kind).toBe('predicate-recurrent-miss');
    expect(payload.opportunities[0]?.rationale).toContain(RECURRENT_PREDICATE);
    expect(payload.source).toBe('mind-self-evolution-cron');
    expect(typeof payload.cycleBucket).toBe('number');

    // (4) Cycle bucket matches the 6h window
    const expectedBucket = Math.floor(
      Date.now() / (SELF_EVOLUTION_CYCLE_BUCKET_HOURS * 3600 * 1000),
    );
    expect(Math.abs(payload.cycleBucket - expectedBucket)).toBeLessThanOrEqual(1);

    // (5) Spine envelope was emitted with the cognition.self.modification_proposed name
    expect(fakeSpine.emit).toHaveBeenCalledTimes(1);
    const emitArg = fakeSpine.emit.mock.calls[0]?.[0] as {
      eventName: string;
      workspaceId: string;
      truthMode: string;
      payload: { opportunityCount: number };
    };
    expect(emitArg.eventName).toBe('cognition.self.modification_proposed');
    expect(emitArg.workspaceId).toBe('ws-cycle-1');
    expect(emitArg.truthMode).toBe('inferred');
    expect(emitArg.payload.opportunityCount).toBe(result.proposal.opportunities.length);
  });

  it('is idempotent inside the same 6h cycle bucket (upsert key collides)', async () => {
    const fakePrisma = buildFakePrisma(makeRecurrentPredictions());
    const fakeSpine = buildFakeSpine();
    const service = new MindSelfModificationService(
      fakePrisma.prisma as never,
      fakeSpine.spine as never,
    );

    const first = await service.runEvolutionCycle('ws-idem');
    const second = await service.runEvolutionCycle('ws-idem');

    // Two ticks => two upsert calls (Prisma upsert collapses to a single row at
    // the DB layer via the unique index workspaceId_idempotencyKey).
    expect(fakePrisma.upsertMock).toHaveBeenCalledTimes(2);
    const keys = fakePrisma.upserts.map((row) => row.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
    expect(first.persisted).toBe(true);
    expect(second.persisted).toBe(true);
  });

  it('returns empty proposal and never persists when workspaceId is empty', async () => {
    const fakePrisma = buildFakePrisma(makeRecurrentPredictions());
    const fakeSpine = buildFakeSpine();
    const service = new MindSelfModificationService(
      fakePrisma.prisma as never,
      fakeSpine.spine as never,
    );

    const result = await service.runEvolutionCycle('');

    expect(result.persisted).toBe(false);
    expect(result.eventId).toBeNull();
    expect(result.proposal.opportunities).toEqual([]);
    expect(fakePrisma.findManyMock).not.toHaveBeenCalled();
    expect(fakePrisma.upsertMock).not.toHaveBeenCalled();
    expect(fakeSpine.emit).not.toHaveBeenCalled();
  });

  it('survives persistence failure without throwing and still emits spine envelope', async () => {
    const findManyMock: AsyncMock<PredictionRow[]> = jest.fn(async () =>
      makeRecurrentPredictions(),
    );
    const upsertMock: AsyncMock<{ id: string }> = jest.fn(async () => {
      throw new Error('simulated DB outage');
    });
    const prisma = {
      mindPrediction: { findMany: findManyMock },
      mindOutboxEvent: { upsert: upsertMock },
    };
    const fakeSpine = buildFakeSpine();
    const service = new MindSelfModificationService(prisma as never, fakeSpine.spine as never);

    const result = await service.runEvolutionCycle('ws-degraded');

    expect(result.persisted).toBe(false);
    expect(result.eventId).toBeNull();
    expect(result.proposal.opportunities.length).toBeGreaterThan(0);
    expect(fakeSpine.emit).toHaveBeenCalledTimes(1);
  });
});
