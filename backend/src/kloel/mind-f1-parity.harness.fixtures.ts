/**
 * MIND_UNIFICATION_PLAN §7 F0–F1 — shared parity-harness fixtures.
 *
 * Stateful in-memory ledger (both `RAC_DecisionOutcome` and `RAC_MindPolicy`
 * tables) plus flag-env hygiene, consumed by:
 *   - `mind-f1-parity.harness.spec.ts` (flags-ON F2-prep + F1 lifecycle)
 *   - `mind-f1-parity.harness.part2.spec.ts` (all-flags-OFF regression)
 *
 * Split out of the single spec to satisfy the CI max_new_file_lines guardrail —
 * no behavior change, no test moved or dropped.
 *
 * @see docs/architecture/MIND_UNIFICATION_PLAN.md (§7 F1/F2, Apêndice A)
 * @see docs/architecture/MIND_F1_FLAGON_RUNBOOK.md (prod flip runbook)
 */
import { DecisionOutcomeService } from './decision-outcome.service';
import { DecisionSweepScheduler } from './decision-sweep.scheduler';
import type { PrismaService } from '../prisma/prisma.service';
import type { MindBanditService } from './mind/policy/mind-bandit.service';

// ---------------------------------------------------------------------------
// Stateful in-memory Prisma fake (only the query shapes these services use).
// ---------------------------------------------------------------------------

export type Row = Record<string, unknown>;

function matchesWhere(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, cond]) => {
    const value = row[field];
    if (cond === null) {
      return value === null || value === undefined;
    }
    if (cond instanceof Date) {
      return value instanceof Date && value.getTime() === cond.getTime();
    }
    if (typeof cond === 'object') {
      const op = cond as Record<string, unknown>;
      if ('not' in op) {
        return op.not === null ? value !== null && value !== undefined : value !== op.not;
      }
      if ('in' in op) {
        return Array.isArray(op.in) && (op.in as unknown[]).includes(value);
      }
      if ('lt' in op) {
        return value instanceof Date && op.lt instanceof Date && value.getTime() < op.lt.getTime();
      }
      throw new Error(`harness: unsupported where operator on "${field}": ${JSON.stringify(cond)}`);
    }
    return value === cond;
  });
}

/** Minimal stateful stand-in for one Prisma table delegate. */
export class FakeTable {
  rows: Row[] = [];

  create = jest.fn(({ data }: { data: Row }) => {
    const row: Row = { createdAt: new Date(), outcomeAt: null, resolvedAt: null, ...data };
    this.rows.push(row);
    return Promise.resolve(row);
  });

  findFirst = jest.fn((args: { where: Record<string, unknown> }) => {
    return Promise.resolve(this.rows.find((r) => matchesWhere(r, args.where)) ?? null);
  });

  findMany = jest.fn(
    (args: { where?: Record<string, unknown>; distinct?: string[]; take?: number }) => {
      let out = this.rows.filter((r) => (args.where ? matchesWhere(r, args.where) : true));
      if (args.distinct) {
        const seen = new Set<string>();
        out = out.filter((r) => {
          const key = (args.distinct as string[]).map((f) => String(r[f])).join('|');
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
      }
      if (typeof args.take === 'number') {
        out = out.slice(0, args.take);
      }
      return Promise.resolve(out);
    },
  );

  updateMany = jest.fn(({ where, data }: { where: Record<string, unknown>; data: Row }) => {
    const hit = this.rows.filter((r) => matchesWhere(r, where));
    for (const r of hit) {
      Object.assign(r, data);
    }
    return Promise.resolve({ count: hit.length });
  });
}

export interface Harness {
  decisionOutcome: FakeTable;
  mindPolicy: FakeTable;
  bandit: { register: jest.Mock; recordOutcome: jest.Mock };
  service: DecisionOutcomeService;
  scheduler: DecisionSweepScheduler;
}

export function buildHarness(): Harness {
  const decisionOutcome = new FakeTable();
  const mindPolicy = new FakeTable();
  const prisma = { decisionOutcome, mindPolicy } as unknown as PrismaService;
  const bandit = {
    register: jest.fn().mockResolvedValue(undefined),
    recordOutcome: jest.fn().mockResolvedValue(undefined),
  };
  const service = new DecisionOutcomeService(prisma, bandit as unknown as MindBanditService);
  const scheduler = new DecisionSweepScheduler(prisma, service);
  return { decisionOutcome, mindPolicy, bandit, service, scheduler };
}

/** Drain fire-and-forget promise chains (record/close helpers are void-returning). */
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

export const silentLogger = { warn: jest.fn() };

export const HOURS = 3600 * 1000;

export function recordInput(workspaceId: string, outcomeKey: string) {
  return {
    workspaceId,
    decisionType: 'chat_reply',
    chosenAction: 'engage',
    baselineAction: 'silence',
    outcomeKey,
    expectedWindow: 1,
    contextSnapshot: { surface: 'dashboard', messageLength: 3 },
  };
}

// ---------------------------------------------------------------------------
// Flag env hygiene — every test starts with ALL F1/F2 flags unset.
// ---------------------------------------------------------------------------

const FLAGS = [
  'KLOEL_DECISION_LEDGER_DUALWRITE',
  'KLOEL_REAL_REWARD_SIGNAL',
  'KLOEL_DECISION_SWEEP_ENABLED',
] as const;

/**
 * Registers the beforeAll/beforeEach/afterAll/afterEach hooks every parity
 * spec file needs. Call once at the top level of each spec file.
 */
export function setupParityFlagEnv(): void {
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const flag of FLAGS) {
      originalEnv[flag] = process.env[flag];
    }
  });

  beforeEach(() => {
    for (const flag of FLAGS) {
      delete process.env[flag];
    }
  });

  afterAll(() => {
    for (const flag of FLAGS) {
      if (originalEnv[flag] === undefined) {
        delete process.env[flag];
      } else {
        process.env[flag] = originalEnv[flag];
      }
    }
  });

  afterEach(() => jest.clearAllMocks());
}
