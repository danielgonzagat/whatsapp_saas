/**
 * Shared fixtures for the cognitive-loop LIVENESS PROOF specs.
 *
 * Holds the row shapes the four loop tables persist plus the faithful in-memory
 * Prisma double both proof specs (`*.proof.spec.ts` and `*.proof.part2.spec.ts`)
 * drive the REAL cognitive services against. Keeping these here lets each spec
 * stay small and run independently while sharing one byte-identical double.
 *
 * The belief table is written through raw SQL (INSERT … ON CONFLICT RETURNING
 * for getOrInit, SELECT … FOR UPDATE for observeBinary), so the double emulates
 * exactly those two statements plus the callback form of $transaction. Every
 * other write is a plain Prisma delegate call.
 */
import { randomUUID } from 'crypto';

export const WS = 'ws-liveness-proof';

export interface BeliefRow {
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

export interface PredictionRow {
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

export interface BanditArmRow {
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

export interface DecisionOutcomeRow {
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

export interface GlobalPriorRow {
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
export class RecordingPrisma {
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
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
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
        return Promise.resolve([]); // ON CONFLICT DO NOTHING → no RETURNING rows
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
      return Promise.resolve([row]);
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
      return Promise.resolve(row ? [row] : []);
    }
    throw new Error(`Unexpected $queryRaw in proof double: ${sql.slice(0, 60)}`);
  }

  mindBelief = {
    updateMany: jest.fn(
      (args: { where: { id: string }; data: Partial<BeliefRow> }): Promise<{ count: number }> => {
        const row = this.beliefs.find((b) => b.id === args.where.id);
        if (!row) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(row, args.data);
        return Promise.resolve({ count: 1 });
      },
    ),
    findFirstOrThrow: jest.fn((args: { where: { id: string } }): Promise<BeliefRow> => {
      const row = this.beliefs.find((b) => b.id === args.where.id);
      if (!row) {
        throw new Error('belief_not_found');
      }
      return Promise.resolve(row);
    }),
    findFirst: jest.fn(
      (args: {
        where: { workspaceId: string; subject: string; predicate: string };
      }): Promise<BeliefRow | null> => {
        return Promise.resolve(
          this.beliefs.find(
            (b) =>
              b.workspaceId === args.where.workspaceId &&
              b.subject === args.where.subject &&
              b.predicate === args.where.predicate,
          ) ?? null,
        );
      },
    ),
  };

  mindPrediction = {
    create: jest.fn(
      (args: {
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
        return Promise.resolve(row);
      },
    ),
    findFirst: jest.fn(
      (args: {
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
        return Promise.resolve(matches[0] ?? null);
      },
    ),
    updateMany: jest.fn(
      (args: {
        where: { id: string; workspaceId: string };
        data: Partial<PredictionRow>;
      }): Promise<{ count: number }> => {
        const row = this.predictions.find(
          (p) => p.id === args.where.id && p.workspaceId === args.where.workspaceId,
        );
        if (!row) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(row, args.data);
        return Promise.resolve({ count: 1 });
      },
    ),
  };

  mindBanditArm = {
    upsert: jest.fn(
      (args: {
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
          const target = existing as Record<keyof BanditArmRow, unknown>;
          for (const [field, value] of Object.entries(args.update)) {
            const key = field as keyof BanditArmRow;
            if (value && typeof value === 'object' && 'increment' in value) {
              const inc = (value as { increment: number }).increment;
              const current = target[key];
              target[key] = (typeof current === 'number' ? current : 0) + inc;
            } else {
              target[key] = value;
            }
          }
          return Promise.resolve(existing);
        }
        const row: BanditArmRow = {
          id: args.create.id ?? randomUUID(),
          workspaceId: key.workspaceId,
          decisionType: key.decisionType,
          arm: key.arm,
          context: args.create.context ?? {},
          alpha: args.create.alpha ?? 1,
          beta: args.create.beta ?? 1,
          pulls: args.create.pulls ?? 0,
          wins: args.create.wins ?? 0,
          isActive: args.create.isActive ?? true,
          promotedAt: null,
        };
        this.arms.push(row);
        return Promise.resolve(row);
      },
    ),
    findMany: jest.fn(
      (args: { where: { workspaceId: string; decisionType: string } }): Promise<BanditArmRow[]> => {
        return Promise.resolve(
          this.arms.filter(
            (a) =>
              a.workspaceId === args.where.workspaceId &&
              a.decisionType === args.where.decisionType,
          ),
        );
      },
    ),
  };

  decisionOutcome = {
    create: jest.fn(
      (args: {
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
        return Promise.resolve(row);
      },
    ),
    updateMany: jest.fn(
      (args: {
        where: { outcomeKey: string; outcomeAt: null };
        data: Partial<DecisionOutcomeRow>;
      }): Promise<{ count: number }> => {
        const matches = this.outcomes.filter(
          (o) => o.outcomeKey === args.where.outcomeKey && o.outcomeAt === null,
        );
        for (const row of matches) {
          Object.assign(row, args.data);
        }
        return Promise.resolve({ count: matches.length });
      },
    ),
    findFirst: jest.fn(
      (args: { where: { outcomeKey: string } }): Promise<DecisionOutcomeRow | null> => {
        const matches = this.outcomes
          .filter((o) => o.outcomeKey === args.where.outcomeKey)
          .sort((a, b) => (b.outcomeAt?.getTime() ?? 0) - (a.outcomeAt?.getTime() ?? 0));
        return Promise.resolve(matches[0] ?? null);
      },
    ),
  };

  mindGlobalPrior = {
    findFirst: jest.fn(
      (args: {
        where: { workspaceId: null; domain: string; predicate: string };
      }): Promise<GlobalPriorRow | null> => {
        return Promise.resolve(
          this.globalPriors.find(
            (g) =>
              g.workspaceId === null &&
              g.domain === args.where.domain &&
              g.predicate === args.where.predicate,
          ) ?? null,
        );
      },
    ),
    create: jest.fn((args: { data: GlobalPriorRow }): Promise<GlobalPriorRow> => {
      const row: GlobalPriorRow = {
        ...args.data,
        context: args.data.context,
      };
      this.globalPriors.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn(
      (args: { where: { id: string }; data: Partial<GlobalPriorRow> }): Promise<GlobalPriorRow> => {
        const row = this.globalPriors.find((g) => g.id === args.where.id);
        if (!row) {
          throw new Error('global_prior_not_found');
        }
        Object.assign(row, args.data);
        return Promise.resolve(row);
      },
    ),
  };
}
