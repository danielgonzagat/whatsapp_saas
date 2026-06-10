/**
 * MIND_UNIFICATION_PLAN §7 F0–F1 — parity harness.
 *
 * Runs the REAL `DecisionOutcomeService` + `DecisionSweepScheduler` against a
 * STATEFUL in-memory ledger (both `RAC_DecisionOutcome` and `RAC_MindPolicy`
 * tables) with the F1/F2 flags toggled via the test process env. No flag is
 * ever required in production for this suite — it exists precisely so flag-ON
 * behavior is proven BEFORE any prod flip.
 *
 * What this file adds on top of the existing specs (extends, does not duplicate):
 *   - `decision-ledger-dualwrite.spec.ts` proves the mirror CALLS fire; here we
 *     prove the resulting ROWS in the two ledgers carry EQUIVALENT payloads
 *     over the full record→close lifecycle (the F2 parity-reader contract).
 *   - `real-reward-signal.wiring.spec.ts` proves the reply engine SKIPS the
 *     immediate WIN-close when `KLOEL_REAL_REWARD_SIGNAL` is on; here we pick
 *     up from that contract and prove the LEDGER consequence lifecycle: the
 *     decision stays PENDING (open) until the sweep records the real LOSS or
 *     the continuation/commerce path records the real WIN.
 *   - All-flags-OFF regression over the same stateful harness (zero behavior
 *     drift vs today's immediate-WIN path).
 *
 * @see docs/architecture/MIND_UNIFICATION_PLAN.md (§7 F1/F2, Apêndice A)
 * @see docs/architecture/MIND_F1_FLAGON_RUNBOOK.md (prod flip runbook)
 */
import { DecisionOutcomeService } from './decision-outcome.service';
import { DecisionSweepScheduler } from './decision-sweep.scheduler';
import {
  closeOpenChatRepliesAsContinued,
  isRealRewardSignalEnabled,
} from './real-reward-signal.flag';
import {
  recordChatReplyDecision,
  closeChatReplyOutcome,
} from './kloel-reply-engine.decision-outcome.helpers';
import { DECISION_LEDGER_MIRROR_SOURCE } from './decision-ledger-dualwrite.helpers';
import type { PrismaService } from '../prisma/prisma.service';
import type { MindBanditService } from './mind/policy/mind-bandit.service';

// ---------------------------------------------------------------------------
// Stateful in-memory Prisma fake (only the query shapes these services use).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

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
        return (
          value instanceof Date && op.lt instanceof Date && value.getTime() < op.lt.getTime()
        );
      }
      throw new Error(`harness: unsupported where operator on "${field}": ${JSON.stringify(cond)}`);
    }
    return value === cond;
  });
}

/** Minimal stateful stand-in for one Prisma table delegate. */
class FakeTable {
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

interface Harness {
  decisionOutcome: FakeTable;
  mindPolicy: FakeTable;
  bandit: { register: jest.Mock; recordOutcome: jest.Mock };
  service: DecisionOutcomeService;
  scheduler: DecisionSweepScheduler;
}

function buildHarness(): Harness {
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
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const silentLogger = { warn: jest.fn() };

const HOURS = 3600 * 1000;

function recordInput(workspaceId: string, outcomeKey: string) {
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

// ---------------------------------------------------------------------------

describe('MIND F0–F1 parity harness (flags ON only via test env — never flips prod)', () => {
  describe('F2-prep — decision-ledger dual-write parity (KLOEL_DECISION_LEDGER_DUALWRITE=true)', () => {
    it('recordDecision lands ONE row in EACH ledger with equivalent payloads', async () => {
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
      const h = buildHarness();

      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      expect(h.decisionOutcome.rows).toHaveLength(1);
      expect(h.mindPolicy.rows).toHaveLength(1);
      const canonical = h.decisionOutcome.rows[0] as Row;
      const mirror = h.mindPolicy.rows[0] as Row;

      // Field-by-field cross-ledger equivalence (the F2 parity-reader contract:
      // join on outcomeKey, compare workspace/type/actions/context).
      expect(mirror.workspaceId).toBe(canonical.workspaceId);
      expect(mirror.decisionType).toBe(canonical.decisionType);
      expect(mirror.chosen).toBe(canonical.chosenAction);
      expect(mirror.baseline).toBe(canonical.baselineAction);
      expect(mirror.outcomeKey).toBe(canonical.outcomeKey);
      expect(mirror.subject).toBe(canonical.outcomeKey);
      expect(mirror.context).toMatchObject(canonical.contextSnapshot as Record<string, unknown>);
      expect((mirror.context as Record<string, unknown>).source).toBe(
        DECISION_LEDGER_MIRROR_SOURCE,
      );
      expect(mirror.candidates).toEqual([{ action: 'engage' }, { action: 'silence' }]);
      // Both sides open: the decision has not been consequence-closed yet.
      expect(canonical.outcomeAt).toBeNull();
      expect(mirror.resolvedAt).toBeNull();
    });

    it('closeOutcome WIN resolves BOTH ledgers equivalently (wonVsBaseline=true ↔ outcome=1)', async () => {
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      await h.service.closeOutcome({
        outcomeKey: 'chat:ws-1:k1',
        outcomeName: 'chat.replied',
        wonVsBaseline: true,
      });

      const canonical = h.decisionOutcome.rows[0] as Row;
      const mirror = h.mindPolicy.rows[0] as Row;
      expect(canonical.outcomeAt).toBeInstanceOf(Date);
      expect(canonical.outcomeName).toBe('chat.replied');
      expect(canonical.wonVsBaseline).toBe(true);
      expect(mirror.resolvedAt).toBeInstanceOf(Date);
      expect(mirror.outcome).toBe(1);
    });

    it('closeOutcome LOSS resolves BOTH ledgers equivalently (wonVsBaseline=false ↔ outcome=0)', async () => {
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      await h.service.closeOutcome({
        outcomeKey: 'chat:ws-1:k1',
        outcomeName: 'chat.error',
        wonVsBaseline: false,
      });

      expect((h.decisionOutcome.rows[0] as Row).wonVsBaseline).toBe(false);
      expect((h.mindPolicy.rows[0] as Row).outcome).toBe(0);
      expect((h.mindPolicy.rows[0] as Row).resolvedAt).toBeInstanceOf(Date);
    });

    it('KNOWN F2 GAP (documented, current behavior): sweepExpired and closeOpenChatReplies close ONLY the canonical ledger — the MindPolicy mirror stays open', async () => {
      // This is the divergence the F2 parity reader WILL see for sweep/continuation
      // -closed rows. It must be reconciled (mirror-resolution on both paths)
      // before KLOEL_DECISION_LEDGER_READ_CANONICAL can flip. Asserted here so
      // the gap is load-bearing documentation, not folklore.
      process.env.KLOEL_DECISION_LEDGER_DUALWRITE = 'true';
      const h = buildHarness();

      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:swept'));
      await h.service.recordDecision(recordInput('ws-2', 'chat:ws-2:continued'));
      (h.decisionOutcome.rows[0] as Row).createdAt = new Date(Date.now() - 25 * HOURS);

      await h.service.sweepExpired('ws-1', 24);
      await h.service.closeOpenChatReplies('ws-2', {
        outcomeName: 'chat.continued',
        wonVsBaseline: true,
      });

      // Canonical: both closed.
      expect((h.decisionOutcome.rows[0] as Row).outcomeName).toBe('inbound.silent_24h');
      expect((h.decisionOutcome.rows[1] as Row).outcomeName).toBe('chat.continued');
      // Mirror: both rows still UNRESOLVED (the gap).
      expect((h.mindPolicy.rows[0] as Row).resolvedAt).toBeNull();
      expect((h.mindPolicy.rows[1] as Row).resolvedAt).toBeNull();
    });
  });

  describe('F1 — real reward lifecycle (KLOEL_REAL_REWARD_SIGNAL + KLOEL_DECISION_SWEEP_ENABLED = true)', () => {
    beforeEach(() => {
      process.env.KLOEL_REAL_REWARD_SIGNAL = 'true';
      process.env.KLOEL_DECISION_SWEEP_ENABLED = 'true';
    });

    it('a chat_reply recorded WITHOUT the immediate WIN-close stays PENDING (open, no reward fed)', async () => {
      // The reply engine suppresses the immediate `chat.replied` WIN-close when
      // the flag is on (proven in real-reward-signal.wiring.spec.ts). This
      // harness picks up from that contract: record only, no close.
      expect(isRealRewardSignalEnabled()).toBe(true);
      const h = buildHarness();

      recordChatReplyDecision(h.service, silentLogger, {
        workspaceId: 'ws-1',
        outcomeKey: 'chat:ws-1:k1',
        surface: 'dashboard',
        messageLength: 3,
      });
      await flush();

      const row = h.decisionOutcome.rows[0] as Row;
      expect(row.decisionType).toBe('chat_reply');
      expect(row.outcomeAt).toBeNull(); // PENDING — não fecha como WIN imediato
      expect(h.bandit.register).toHaveBeenCalledWith(
        expect.objectContaining({ decisionType: 'chat_reply', arms: ['engage', 'silence'] }),
      );
      expect(h.bandit.recordOutcome).not.toHaveBeenCalled(); // no reward until a real consequence
    });

    it('the sweep does NOT close the pending decision before the 24h window', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      const summary = await h.scheduler.sweepActiveWorkspaces();

      expect(summary.skipped).toBe(false);
      expect(summary.sweptCount).toBe(0);
      expect((h.decisionOutcome.rows[0] as Row).outcomeAt).toBeNull(); // still pending
    });

    it('after 24h of silence the sweep closes the pending decision as a REAL LOSS and feeds outcome=0 to the bandit', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));
      (h.decisionOutcome.rows[0] as Row).createdAt = new Date(Date.now() - 25 * HOURS);

      const summary = await h.scheduler.sweepActiveWorkspaces();

      expect(summary).toMatchObject({
        skipped: false,
        sweptCount: 1,
        byWorkspace: [{ workspaceId: 'ws-1', swept: 1 }],
      });
      const row = h.decisionOutcome.rows[0] as Row;
      expect(row.outcomeAt).toBeInstanceOf(Date);
      expect(row.outcomeName).toBe('inbound.silent_24h');
      expect(row.wonVsBaseline).toBe(false);
      expect(h.bandit.recordOutcome).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        decisionType: 'chat_reply',
        arm: 'engage',
        outcome: 0,
      });
    });

    it('a next inbound message closes the pending decision as a REAL WIN (chat.continued, outcome=1) — workspace-scoped', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));
      await h.service.recordDecision(recordInput('ws-2', 'chat:ws-2:k1'));

      // The reply engine fires this at the START of the next reply for ws-1
      // (kloel-reply-engine.service.ts → closeOpenChatRepliesAsContinued).
      closeOpenChatRepliesAsContinued(h.service, silentLogger, { workspaceId: 'ws-1' });
      await flush();

      const ws1 = h.decisionOutcome.rows[0] as Row;
      const ws2 = h.decisionOutcome.rows[1] as Row;
      expect(ws1.outcomeName).toBe('chat.continued');
      expect(ws1.wonVsBaseline).toBe(true);
      expect(ws1.outcomeAt).toBeInstanceOf(Date);
      expect(ws2.outcomeAt).toBeNull(); // cross-workspace isolation (plan invariant 1)
      expect(h.bandit.recordOutcome).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        decisionType: 'chat_reply',
        arm: 'engage',
        outcome: 1,
      });
    });

    it('a continuation-WON decision is never re-swept as a loss (close-at-most-once, plan invariant 5)', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));

      closeOpenChatRepliesAsContinued(h.service, silentLogger, { workspaceId: 'ws-1' });
      await flush();
      (h.decisionOutcome.rows[0] as Row).createdAt = new Date(Date.now() - 25 * HOURS);

      const summary = await h.scheduler.sweepActiveWorkspaces();

      expect(summary.sweptCount).toBe(0);
      const row = h.decisionOutcome.rows[0] as Row;
      expect(row.outcomeName).toBe('chat.continued'); // WIN preserved
      expect(row.wonVsBaseline).toBe(true);
    });
  });

  describe('regressão zero — todas as flags F1/F2 OFF (default) mantém o comportamento atual', () => {
    it("today's reply path: record + immediate WIN close on the canonical ledger; RAC_MindPolicy is NEVER touched", async () => {
      const h = buildHarness();

      // Exactly what the reply engine does with the flag OFF: record at reply
      // start, close as chat.replied/won immediately on success.
      recordChatReplyDecision(h.service, silentLogger, {
        workspaceId: 'ws-1',
        outcomeKey: 'chat:ws-1:k1',
        surface: 'dashboard',
        messageLength: 3,
      });
      await flush();
      closeChatReplyOutcome(h.service, silentLogger, {
        outcomeKey: 'chat:ws-1:k1',
        outcomeName: 'chat.replied',
        wonVsBaseline: true,
      });
      await flush();

      const row = h.decisionOutcome.rows[0] as Row;
      expect(row.outcomeName).toBe('chat.replied');
      expect(row.wonVsBaseline).toBe(true);
      expect(row.outcomeAt).toBeInstanceOf(Date);
      expect(h.bandit.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ arm: 'engage', outcome: 1 }),
      );
      // Dual-write OFF → the parallel ledger does not exist for this path.
      expect(h.mindPolicy.rows).toHaveLength(0);
      expect(h.mindPolicy.findFirst).not.toHaveBeenCalled();
      expect(h.mindPolicy.create).not.toHaveBeenCalled();
      expect(h.mindPolicy.updateMany).not.toHaveBeenCalled();
    });

    it('sweep scheduler is a pure no-op: no enumeration query, aged open rows untouched', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));
      (h.decisionOutcome.rows[0] as Row).createdAt = new Date(Date.now() - 25 * HOURS);
      h.decisionOutcome.findMany.mockClear();

      const summary = await h.scheduler.sweepActiveWorkspaces();

      expect(summary).toEqual({ skipped: true, scannedWorkspaces: 0, sweptCount: 0, byWorkspace: [] });
      expect(h.decisionOutcome.findMany).not.toHaveBeenCalled();
      expect((h.decisionOutcome.rows[0] as Row).outcomeAt).toBeNull();
    });

    it('continuation closer is a no-op with the flag OFF: open decision untouched, no service call', async () => {
      const h = buildHarness();
      await h.service.recordDecision(recordInput('ws-1', 'chat:ws-1:k1'));
      const closeSpy = jest.spyOn(h.service, 'closeOpenChatReplies');

      closeOpenChatRepliesAsContinued(h.service, silentLogger, { workspaceId: 'ws-1' });
      await flush();

      expect(closeSpy).not.toHaveBeenCalled();
      expect((h.decisionOutcome.rows[0] as Row).outcomeAt).toBeNull();
      expect(h.decisionOutcome.updateMany).not.toHaveBeenCalled();
    });
  });
});
