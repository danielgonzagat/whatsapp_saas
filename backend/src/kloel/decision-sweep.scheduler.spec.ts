/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { DecisionSweepScheduler } from './decision-sweep.scheduler';
import type { PrismaService } from '../prisma/prisma.service';
import type { DecisionOutcomeService } from './decision-outcome.service';

/**
 * Covers the ADDITIVE, flag-gated runnable surface that wires the otherwise-DEAD
 * `DecisionOutcomeService.sweepExpired` (the chat_reply TIMEOUT-LOSS learner)
 * into a NestJS @Cron.
 *
 * Contract:
 *   - flag OFF (default): the @Cron + `sweepActiveWorkspaces` are a pure no-op —
 *     NO workspace enumeration query, NO `sweepExpired` call (byte-identical to
 *     today's behaviour, where the method had no production caller);
 *   - flag ON: enumerates workspaces with at least one OPEN decision
 *     (`outcomeAt: null`, distinct workspaceId) and calls `sweepExpired` per
 *     workspace — the timeout-loss loop CLOSES;
 *   - the @Cron handler is fail-open: a thrown error is swallowed (routed to the
 *     optional ops-alert sink, logged, never re-thrown).
 */
describe('DecisionSweepScheduler (flag-gated timeout-loss sweep surface)', () => {
  const originalFlag = process.env.KLOEL_DECISION_SWEEP_ENABLED;

  type MockPrisma = {
    decisionOutcome: { findMany: jest.Mock };
  };

  function buildPrisma(openDecisionWorkspaceIds: string[] = ['ws-1']): MockPrisma {
    return {
      decisionOutcome: {
        findMany: jest.fn(async () =>
          openDecisionWorkspaceIds.map((workspaceId) => ({ workspaceId })),
        ),
      },
    };
  }

  function buildDecisionOutcome(sweptPerWorkspace = 2): {
    sweepExpired: jest.Mock;
  } {
    return {
      sweepExpired: jest.fn().mockResolvedValue(sweptPerWorkspace),
    };
  }

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_DECISION_SWEEP_ENABLED;
    } else {
      process.env.KLOEL_DECISION_SWEEP_ENABLED = originalFlag;
    }
    jest.restoreAllMocks();
  });

  describe('flag OFF (default)', () => {
    beforeEach(() => {
      delete process.env.KLOEL_DECISION_SWEEP_ENABLED;
    });

    it('sweepActiveWorkspaces is a no-op: no enumeration, no sweep', async () => {
      const prisma = buildPrisma();
      const decisionOutcome = buildDecisionOutcome();
      const scheduler = new DecisionSweepScheduler(
        prisma as unknown as PrismaService,
        decisionOutcome as unknown as DecisionOutcomeService,
      );

      const summary = await scheduler.sweepActiveWorkspaces();

      expect(summary.skipped).toBe(true);
      expect(summary.scannedWorkspaces).toBe(0);
      expect(summary.sweptCount).toBe(0);
      expect(prisma.decisionOutcome.findMany).not.toHaveBeenCalled();
      expect(decisionOutcome.sweepExpired).not.toHaveBeenCalled();
    });

    it('@Cron handler does NOT call sweepExpired when flag OFF', async () => {
      const prisma = buildPrisma();
      const decisionOutcome = buildDecisionOutcome();
      const scheduler = new DecisionSweepScheduler(
        prisma as unknown as PrismaService,
        decisionOutcome as unknown as DecisionOutcomeService,
      );

      await expect(scheduler.runDecisionSweepCron()).resolves.toBeUndefined();

      expect(prisma.decisionOutcome.findMany).not.toHaveBeenCalled();
      expect(decisionOutcome.sweepExpired).not.toHaveBeenCalled();
    });
  });

  describe('flag ON', () => {
    beforeEach(() => {
      process.env.KLOEL_DECISION_SWEEP_ENABLED = 'true';
    });

    it('closes the loop: enumerates open-decision workspaces and sweeps each', async () => {
      const prisma = buildPrisma(['ws-1', 'ws-2']);
      const decisionOutcome = buildDecisionOutcome(2);
      const scheduler = new DecisionSweepScheduler(
        prisma as unknown as PrismaService,
        decisionOutcome as unknown as DecisionOutcomeService,
      );

      const summary = await scheduler.sweepActiveWorkspaces();

      expect(summary.skipped).toBe(false);
      expect(summary.scannedWorkspaces).toBe(2);
      // 2 workspaces × 2 swept each = 4 timeout-losses recorded.
      expect(summary.sweptCount).toBe(4);
      expect(summary.byWorkspace).toEqual([
        { workspaceId: 'ws-1', swept: 2 },
        { workspaceId: 'ws-2', swept: 2 },
      ]);

      // The DEAD method now has a live caller — once per enumerated workspace,
      // with the 24h timeout-loss window.
      expect(decisionOutcome.sweepExpired).toHaveBeenCalledTimes(2);
      expect(decisionOutcome.sweepExpired).toHaveBeenCalledWith('ws-1', 24);
      expect(decisionOutcome.sweepExpired).toHaveBeenCalledWith('ws-2', 24);

      // Enumeration is a distinct read of OPEN decisions only.
      expect(prisma.decisionOutcome.findMany).toHaveBeenCalledTimes(1);
      const enumArgs = prisma.decisionOutcome.findMany.mock.calls[0][0] as {
        where: { outcomeAt: null | unknown };
        distinct: string[];
      };
      expect(enumArgs.where.outcomeAt).toBeNull();
      expect(enumArgs.distinct).toEqual(['workspaceId']);
    });

    it('reports clean when no workspace has an open decision', async () => {
      const prisma = buildPrisma([]);
      const decisionOutcome = buildDecisionOutcome();
      const scheduler = new DecisionSweepScheduler(
        prisma as unknown as PrismaService,
        decisionOutcome as unknown as DecisionOutcomeService,
      );

      const summary = await scheduler.sweepActiveWorkspaces();

      expect(summary.scannedWorkspaces).toBe(0);
      expect(summary.sweptCount).toBe(0);
      expect(decisionOutcome.sweepExpired).not.toHaveBeenCalled();
    });

    it('@Cron handler drives the sweep when flag ON', async () => {
      const prisma = buildPrisma(['ws-1']);
      const decisionOutcome = buildDecisionOutcome(1);
      const scheduler = new DecisionSweepScheduler(
        prisma as unknown as PrismaService,
        decisionOutcome as unknown as DecisionOutcomeService,
      );

      await expect(scheduler.runDecisionSweepCron()).resolves.toBeUndefined();

      expect(prisma.decisionOutcome.findMany).toHaveBeenCalledTimes(1);
      expect(decisionOutcome.sweepExpired).toHaveBeenCalledWith('ws-1', 24);
    });

    it('@Cron handler is fail-open — swallows errors and never re-throws', async () => {
      const prisma = buildPrisma(['ws-1']);
      prisma.decisionOutcome.findMany.mockRejectedValueOnce(new Error('db down'));
      const decisionOutcome = buildDecisionOutcome();
      const opsAlert = { alertOnCriticalError: jest.fn().mockResolvedValue(undefined) };
      const scheduler = new DecisionSweepScheduler(
        prisma as unknown as PrismaService,
        decisionOutcome as unknown as DecisionOutcomeService,
        opsAlert as never,
      );

      await expect(scheduler.runDecisionSweepCron()).resolves.toBeUndefined();
      expect(opsAlert.alertOnCriticalError).toHaveBeenCalledTimes(1);
    });
  });
});
