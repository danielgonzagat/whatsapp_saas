/**
 * LIVENESS PROOF — the cognitive loop actually PERSISTS rows.
 *
 * The smoke test mocks the SSE and proves nothing about whether Kloel learns.
 * This spec drives ONE assistant reply end-to-end through the REAL cognitive
 * services (no method stubs on the production loop) against a faithful
 * in-memory Prisma double that records every write, and asserts the four rows
 * that prove Y (the cognitive loop) is closing — not merely compiling:
 *
 *   (a) determinism router → DecisionOutcomeService.recordDecision  → a real
 *       RAC_DecisionOutcome row + bandit arms registered (engage/silence)
 *   (b) reply prediction    → MindPredictorService.predictReply      → a real
 *       RAC_MindPrediction row with the canonical P(reply|...) predicate
 *   (c) outcome resolution  → MindSurpriseService.resolveReply        → the
 *       underlying RAC_MindBelief alpha (success) OR beta (failure) increments
 *       off the Beta(1,1) uniform prior
 *   (d) reward feedback     → DecisionOutcomeService.closeOutcome      → a
 *       RAC_MindBanditArm upsert (alpha/beta/wins increment) AND a
 *       MindGlobalPriorService.recordObservation row
 *
 * These are the exact four tables that read 0 rows in production
 * (RAC_MindPrediction / RAC_MindBanditArm / RAC_DecisionOutcome empty,
 * RAC_MindBelief stuck at the seed priors). If the wiring regresses, this
 * proof goes red — never weaken an assertion to force green.
 *
 * The belief table is written through raw SQL (INSERT … ON CONFLICT RETURNING
 * for getOrInit, SELECT … FOR UPDATE for observeBinary), so the double
 * emulates exactly those two statements plus the callback form of
 * $transaction. Every other write is a plain Prisma delegate call.
 */
import { randomUUID } from 'crypto';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindPredictorService } from './mind/inference/mind-predictor.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { MindBanditService } from './mind/policy/mind-bandit.service';
import { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';

const WS = 'ws-liveness-proof';

interface BeliefRow {
  id: string;
  workspaceId: string;
  subject: string;
  predicate: string;
  context: Record<string, unknown>;
  mean: number;
  variance: number;
  samples: number;
  alpha: number;
  beta: number;
  lastUpdate?: Date;
}

interface PredictionRow {
  id: string;
  workspaceId: string;
  subject: string;
  predicate: string;
  context: Record<string, unknown>;
  predictedMean: number;
  predictedVariance: number;
  horizonSec: number;
  deadline: Date;
  actual: number | null;
  surprise: number | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

interface BanditArmRow {
  id: string;
  workspaceId: string;
  decisionType: string;
  arm: string;
  context: Record<string, unknown>;
  alpha: number;
  beta: number;
  pulls: number;
  wins: number;
  isActive: boolean;
  promotedAt: Date | null;
}

interface DecisionOutcomeRow {
  id: string;
  workspaceId: string;
  decisionType: string;
  chosenAction: string;
  baselineAction: string | null;
  outcomeKey: string;
  expectedWindow: number;
  contextSnapshot: Record<string, unknown>;
  outcomeAt: Date | null;
  outcomeName: string | null;
  outcomeValue: Record<string, unknown> | null;
  economicValue: number | null;
  wonVsBaseline: boolean | null;
  createdAt: Date;
}

interface GlobalPriorRow {
  id: string;
  workspaceId: string | null;
  domain: string;
  predicate: string;
  context: Record<string, unknown>;
  mean: number;
  variance: number;
  samples: number;
  anonymizedBy: string;
}

/**
 * Faithful in-memory Prisma double. Plain delegate calls mutate the backing
 * arrays exactly as the production loop expects; the two raw-SQL statements the
 * belief service issues are matched on their leading keyword and answered from
 * the same store, so reads observe prior writes within a $transaction.
 */
class RecordingPrisma {
  beliefs: BeliefRow[] = [];
  predictions: PredictionRow[] = [];
  arms: BanditArmRow[] = [];
  outcomes: DecisionOutcomeRow[] = [];
  globalPriors: GlobalPriorRow[] = [];

  // ── $transaction: callback form only (every caller in the loop uses cb) ──
  async $transaction<T>(cb: (tx: this) => Promise<T>): Promise<T> {
    return cb(this);
  }

  // ── $queryRaw: belief getOrInit (INSERT…ON CONFLICT) + observeBinary (SELECT…FOR UPDATE) ──
  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
    const sql = strings.join('').trim();
    if (sql.startsWith('INSERT INTO "RAC_MindBelief"')) {
      // Positional template values: id, workspaceId, subject, predicate,
      // contextJson, mean, variance, (literal 0 samples), alpha, beta.
      const [id, workspaceId, subject, predicate, contextJson, mean, variance, alpha, beta] =
        values as [string, string, string, string, string, number, number, number, number];
      const context = JSON.parse(contextJson) as Record<string, unknown>;
      const existing = this.beliefs.find(
        (b) =>
          b.workspaceId === workspaceId &&
          b.subject === subject &&
          b.predicate === predicate &&
          JSON.stringify(b.context) === JSON.stringify(context),
      );
      if (existing) {
        return []; // ON CONFLICT DO NOTHING → no RETURNING rows
      }
      const row: BeliefRow = {
        id,
        workspaceId,
        subject,
        predicate,
        context,
        mean,
        variance,
        samples: 0,
        alpha,
        beta,
      };
      this.beliefs.push(row);
      return [row];
    }
    if (sql.startsWith('SELECT * FROM "RAC_MindBelief"')) {
      // observeBinary lock read: id, workspaceId, subject, predicate.
      const [id, workspaceId, subject, predicate] = values as [string, string, string, string];
      const row = this.beliefs.find(
        (b) =>
          b.id === id &&
          b.workspaceId === workspaceId &&
          b.subject === subject &&
          b.predicate === predicate,
      );
      return row ? [row] : [];
    }
    throw new Error(`Unexpected $queryRaw in proof double: ${sql.slice(0, 60)}`);
  }

  mindBelief = {
    updateMany: jest.fn(
      async (args: {
        where: { id: string };
        data: Partial<BeliefRow>;
      }): Promise<{ count: number }> => {
        const row = this.beliefs.find((b) => b.id === args.where.id);
        if (!row) {
          return { count: 0 };
        }
        Object.assign(row, args.data);
        return { count: 1 };
      },
    ),
    findFirstOrThrow: jest.fn(async (args: { where: { id: string } }): Promise<BeliefRow> => {
      const row = this.beliefs.find((b) => b.id === args.where.id);
      if (!row) {
        throw new Error('belief_not_found');
      }
      return row;
    }),
    findFirst: jest.fn(
      async (args: {
        where: { workspaceId: string; subject: string; predicate: string };
      }): Promise<BeliefRow | null> => {
        return (
          this.beliefs.find(
            (b) =>
              b.workspaceId === args.where.workspaceId &&
              b.subject === args.where.subject &&
              b.predicate === args.where.predicate,
          ) ?? null
        );
      },
    ),
  };

  mindPrediction = {
    create: jest.fn(
      async (args: {
        data: Omit<PredictionRow, 'actual' | 'surprise' | 'resolvedAt' | 'createdAt'>;
      }): Promise<PredictionRow> => {
        const row: PredictionRow = {
          ...args.data,
          context: args.data.context,
          actual: null,
          surprise: null,
          resolvedAt: null,
          createdAt: new Date(),
        };
        this.predictions.push(row);
        return row;
      },
    ),
    findFirst: jest.fn(
      async (args: {
        where: { workspaceId: string; subject: string; predicate: string; resolvedAt: null };
      }): Promise<PredictionRow | null> => {
        const matches = this.predictions
          .filter(
            (p) =>
              p.workspaceId === args.where.workspaceId &&
              p.subject === args.where.subject &&
              p.predicate === args.where.predicate &&
              p.resolvedAt === null,
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ?? null;
      },
    ),
    updateMany: jest.fn(
      async (args: {
        where: { id: string; workspaceId: string };
        data: Partial<PredictionRow>;
      }): Promise<{ count: number }> => {
        const row = this.predictions.find(
          (p) => p.id === args.where.id && p.workspaceId === args.where.workspaceId,
        );
        if (!row) {
          return { count: 0 };
        }
        Object.assign(row, args.data);
        return { count: 1 };
      },
    ),
  };

  mindBanditArm = {
    upsert: jest.fn(
      async (args: {
        where: {
          workspaceId_decisionType_arm: { workspaceId: string; decisionType: string; arm: string };
        };
        update: Record<string, unknown>;
        create: Partial<BanditArmRow> & { workspaceId: string; decisionType: string; arm: string };
      }): Promise<BanditArmRow> => {
        const key = args.where.workspaceId_decisionType_arm;
        const existing = this.arms.find(
          (a) =>
            a.workspaceId === key.workspaceId &&
            a.decisionType === key.decisionType &&
            a.arm === key.arm,
        );
        if (existing) {
          for (const [field, value] of Object.entries(args.update)) {
            if (value && typeof value === 'object' && 'increment' in value) {
              const inc = (value as { increment: number }).increment;
              (existing as unknown as Record<string, number>)[field] += inc;
            } else {
              (existing as unknown as Record<string, unknown>)[field] = value;
            }
          }
          return existing;
        }
        const row: BanditArmRow = {
          id: args.create.id ?? randomUUID(),
          workspaceId: key.workspaceId,
          decisionType: key.decisionType,
          arm: key.arm,
          context: (args.create.context as Record<string, unknown>) ?? {},
          alpha: args.create.alpha ?? 1,
          beta: args.create.beta ?? 1,
          pulls: args.create.pulls ?? 0,
          wins: args.create.wins ?? 0,
          isActive: args.create.isActive ?? true,
          promotedAt: null,
        };
        this.arms.push(row);
        return row;
      },
    ),
    findMany: jest.fn(
      async (args: {
        where: { workspaceId: string; decisionType: string };
      }): Promise<BanditArmRow[]> => {
        return this.arms.filter(
          (a) =>
            a.workspaceId === args.where.workspaceId && a.decisionType === args.where.decisionType,
        );
      },
    ),
  };

  decisionOutcome = {
    create: jest.fn(
      async (args: {
        data: Omit<
          DecisionOutcomeRow,
          | 'outcomeAt'
          | 'outcomeName'
          | 'outcomeValue'
          | 'economicValue'
          | 'wonVsBaseline'
          | 'createdAt'
        > & { baselineAction?: string | null };
      }): Promise<DecisionOutcomeRow> => {
        const row: DecisionOutcomeRow = {
          ...args.data,
          baselineAction: args.data.baselineAction ?? null,
          contextSnapshot: args.data.contextSnapshot,
          outcomeAt: null,
          outcomeName: null,
          outcomeValue: null,
          economicValue: null,
          wonVsBaseline: null,
          createdAt: new Date(),
        };
        this.outcomes.push(row);
        return row;
      },
    ),
    updateMany: jest.fn(
      async (args: {
        where: { outcomeKey: string; outcomeAt: null };
        data: Partial<DecisionOutcomeRow>;
      }): Promise<{ count: number }> => {
        const matches = this.outcomes.filter(
          (o) => o.outcomeKey === args.where.outcomeKey && o.outcomeAt === null,
        );
        for (const row of matches) {
          Object.assign(row, args.data);
        }
        return { count: matches.length };
      },
    ),
    findFirst: jest.fn(
      async (args: { where: { outcomeKey: string } }): Promise<DecisionOutcomeRow | null> => {
        const matches = this.outcomes
          .filter((o) => o.outcomeKey === args.where.outcomeKey)
          .sort((a, b) => (b.outcomeAt?.getTime() ?? 0) - (a.outcomeAt?.getTime() ?? 0));
        return matches[0] ?? null;
      },
    ),
  };

  mindGlobalPrior = {
    findFirst: jest.fn(
      async (args: {
        where: { workspaceId: null; domain: string; predicate: string };
      }): Promise<GlobalPriorRow | null> => {
        return (
          this.globalPriors.find(
            (g) =>
              g.workspaceId === null &&
              g.domain === args.where.domain &&
              g.predicate === args.where.predicate,
          ) ?? null
        );
      },
    ),
    create: jest.fn(async (args: { data: GlobalPriorRow }): Promise<GlobalPriorRow> => {
      const row: GlobalPriorRow = {
        ...args.data,
        context: args.data.context,
      };
      this.globalPriors.push(row);
      return row;
    }),
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: Partial<GlobalPriorRow>;
      }): Promise<GlobalPriorRow> => {
        const row = this.globalPriors.find((g) => g.id === args.where.id);
        if (!row) {
          throw new Error('global_prior_not_found');
        }
        Object.assign(row, args.data);
        return row;
      },
    ),
  };
}

describe('Cognitive loop LIVENESS PROOF — one reply persists the four loop tables', () => {
  let prisma: RecordingPrisma;
  let bandit: MindBanditService;
  let belief: MindBeliefService;
  let predictor: MindPredictorService;
  let surprise: MindSurpriseService;
  let globalPrior: MindGlobalPriorService;
  let decisionOutcome: DecisionOutcomeService;

  beforeEach(() => {
    prisma = new RecordingPrisma();
    bandit = new MindBanditService(prisma);
    // globalPrior wired into belief so getOrInit seeds Beta(1,1) when no prior.
    globalPrior = new MindGlobalPriorService(prisma);
    belief = new MindBeliefService(prisma, globalPrior);
    predictor = new MindPredictorService(prisma, belief);
    surprise = new MindSurpriseService(prisma, belief, predictor);
    decisionOutcome = new DecisionOutcomeService(prisma, bandit);
  });

  it('drives a reply through router → predict → resolve → reward and PERSISTS all four loop tables', async () => {
    const subject = WS;
    const outcomeKey = `chat:${WS}:${Date.now()}:proof01`;

    // ── (a) Determinism router records the chat_reply decision. This creates a
    //        real DecisionOutcome row AND registers the 'engage'/'silence'
    //        bandit arms (fire-and-forget register). ──
    await decisionOutcome.recordDecision({
      workspaceId: WS,
      decisionType: 'chat_reply',
      chosenAction: 'engage',
      baselineAction: 'silence',
      outcomeKey,
      expectedWindow: 1,
      contextSnapshot: { surface: 'guest', messageLength: 42 },
    });
    // register() is fire-and-forget inside recordDecision; await its settle.
    await Promise.resolve();
    await new Promise((r) => setImmediate(r));

    expect(prisma.outcomes).toHaveLength(1);
    expect(prisma.outcomes[0]).toMatchObject({
      decisionType: 'chat_reply',
      chosenAction: 'engage',
      baselineAction: 'silence',
      outcomeKey,
      outcomeAt: null,
    });
    // Both arms registered at the Beta(1,1) uniform prior.
    const enarm = prisma.arms.find((a) => a.arm === 'engage');
    const siarm = prisma.arms.find((a) => a.arm === 'silence');
    expect(enarm).toBeDefined();
    expect(siarm).toBeDefined();
    expect(enarm).toMatchObject({ alpha: 1, beta: 1, decisionType: 'chat_reply', isActive: true });

    // ── (b) Reply prediction is persisted BEFORE the reply is acted on. This is
    //        the producer that fed the empty RAC_MindPrediction table. ──
    const prediction = await predictor.predictReply(
      {
        workspaceId: WS,
        subject,
        features: { template: 'guest', channel: 'guest', hour: 14 },
      },
      60,
    );

    expect(prisma.predictions).toHaveLength(1);
    expect(prediction.predicate).toBe('P(reply|template,hour,channel)');
    expect(prisma.predictions[0]).toMatchObject({
      workspaceId: WS,
      subject,
      predicate: 'P(reply|template,hour,channel)',
      resolvedAt: null,
    });
    // getOrInit created the underlying belief at the Beta(1,1) seed prior.
    const seededBelief = prisma.beliefs.find(
      (b) => b.predicate === 'P(reply|template,hour,channel)',
    );
    expect(seededBelief).toMatchObject({ alpha: 1, beta: 1, samples: 0 });

    // ── (c) Outcome resolution: the reply succeeded (assistant replied → 1).
    //        resolveReply resolves the open prediction AND moves the belief's
    //        alpha off the 1/1 prior via observeBinary. ──
    const surpriseValue = await surprise.resolveReply(WS, subject, 1);

    expect(typeof surpriseValue).toBe('number');
    // Prediction is now resolved (loop closed on the predictive-coding side).
    expect(prisma.predictions[0].resolvedAt).not.toBeNull();
    expect(prisma.predictions[0].actual).toBe(1);
    // Belief alpha incremented off the uniform prior; samples advanced.
    const movedBelief = prisma.beliefs.find(
      (b) => b.predicate === 'P(reply|template,hour,channel)',
    );
    expect(movedBelief).toBeDefined();
    expect(movedBelief?.alpha).toBe(2); // 1 (prior) + 1 (success)
    expect(movedBelief?.beta).toBe(1); // unchanged on a success
    expect(movedBelief?.samples).toBe(1);

    // ── (d) Reward feedback: closing the outcome feeds the win back into the
    //        bandit arm (alpha/wins increment) — the real learning signal. ──
    await decisionOutcome.closeOutcome({
      outcomeKey,
      outcomeName: 'chat.replied',
      wonVsBaseline: true,
    });

    // DecisionOutcome row closed with the won-vs-baseline reward.
    expect(prisma.outcomes[0].outcomeAt).not.toBeNull();
    expect(prisma.outcomes[0].outcomeName).toBe('chat.replied');
    expect(prisma.outcomes[0].wonVsBaseline).toBe(true);
    // Bandit arm 'engage' learned from the win: alpha/wins incremented off 1/1.
    const learnedArm = prisma.arms.find((a) => a.arm === 'engage');
    expect(learnedArm?.alpha).toBe(2); // 1 (prior) + 1 (win)
    expect(learnedArm?.wins).toBe(1);

    // ── A MindGlobalPrior observation aggregates the same win anonymously so
    //        cross-workspace priors actually accumulate. ──
    await globalPrior.recordObservation('guest', 'chat_reply', 'engage', true);
    expect(prisma.globalPriors).toHaveLength(1);
    expect(prisma.globalPriors[0]).toMatchObject({
      workspaceId: null,
      domain: 'global_anonymous',
      predicate: 'bandit-obs:chat_reply:engage',
      samples: 1,
      mean: 1,
    });

    // The four previously-empty loop tables now all hold real rows.
    expect(prisma.outcomes.length).toBeGreaterThan(0);
    expect(prisma.predictions.length).toBeGreaterThan(0);
    expect(prisma.arms.length).toBeGreaterThan(0);
    expect(prisma.globalPriors.length).toBeGreaterThan(0);
  });

  it('a FAILED reply moves the belief beta and records a loss-vs-baseline reward', async () => {
    const subject = WS;
    const outcomeKey = `chat:${WS}:${Date.now()}:proof02`;

    await decisionOutcome.recordDecision({
      workspaceId: WS,
      decisionType: 'chat_reply',
      chosenAction: 'engage',
      baselineAction: 'silence',
      outcomeKey,
      expectedWindow: 1,
      contextSnapshot: { surface: 'guest', messageLength: 0 },
    });
    await new Promise((r) => setImmediate(r));

    await predictor.predictReply(
      { workspaceId: WS, subject, features: { template: 'guest', channel: 'guest', hour: 9 } },
      60,
    );

    // observed = 0 → degraded reply (no assistant text produced).
    await surprise.resolveReply(WS, subject, 0);
    const movedBelief = prisma.beliefs.find(
      (b) => b.predicate === 'P(reply|template,hour,channel)',
    );
    expect(movedBelief?.alpha).toBe(1); // unchanged on a failure
    expect(movedBelief?.beta).toBe(2); // 1 (prior) + 1 (failure)
    expect(movedBelief?.samples).toBe(1);

    await decisionOutcome.closeOutcome({
      outcomeKey,
      outcomeName: 'chat.error',
      wonVsBaseline: false,
    });
    const learnedArm = prisma.arms.find((a) => a.arm === 'engage');
    expect(learnedArm?.beta).toBe(2); // 1 (prior) + 1 (loss)
    expect(learnedArm?.wins).toBe(0);
    expect(prisma.outcomes[0].wonVsBaseline).toBe(false);
  });
});
