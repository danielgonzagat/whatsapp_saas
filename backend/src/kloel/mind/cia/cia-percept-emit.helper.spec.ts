import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  CIA_ACTION_EXECUTED_EVENT_TYPE,
  CIA_DECISION_MADE_EVENT_TYPE,
  emitCiaActionExecutedPercept,
  emitCiaDecisionMadePercept,
} from './cia-percept-emit.helper';

const FLAG = 'KLOEL_CIA_PERCEPT_ENABLED';

function makeDeps() {
  const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const prisma = { mindOutboxEvent: { upsert } } as never;
  const logger = { warn: jest.fn() };
  return { upsert, prisma, logger };
}

const decisionParams = {
  workspaceId: 'ws_1',
  runId: 'run_1',
  autonomyMode: 'BACKLOG',
  triggeredBy: 'owner_command',
  backlogMode: 'reply_all_recent_first',
};

const actionParams = {
  workspaceId: 'ws_1',
  runId: 'run_1',
  executionPath: 'queue',
  candidateCount: 7,
};

describe('cia percept emit helpers', () => {
  const prev = process.env[FLAG];

  beforeEach(() => {
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
    jest.clearAllMocks();
  });

  describe('emitCiaDecisionMadePercept', () => {
    it('flag default (unset): emits — cognition loop ON by default', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCiaDecisionMadePercept(prisma, logger, decisionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag set to a non-"true" value stays inert', async () => {
      process.env[FLAG] = 'false';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCiaDecisionMadePercept(prisma, logger, decisionParams);

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical cognition.cia.decision_made percept', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCiaDecisionMadePercept(prisma, logger, decisionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.cia.decision_made:run_1',
      });
      expect(arg.create.eventType).toBe(CIA_DECISION_MADE_EVENT_TYPE);
      expect(arg.create.subject).toBe('cia:run:run_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      expect(arg.create.payload).toMatchObject({
        runId: 'run_1',
        autonomyMode: 'BACKLOG',
        triggeredBy: 'owner_command',
        backlogMode: 'reply_all_recent_first',
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCiaDecisionMadePercept(prisma, logger, {
        ...decisionParams,
        workspaceId: '',
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON + outbox throws: swallows the error and warn-logs', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();
      upsert.mockRejectedValueOnce(new Error('db down'));

      const attempted = await emitCiaDecisionMadePercept(prisma, logger, decisionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitCiaActionExecutedPercept', () => {
    it('flag default (unset): emits — cognition loop ON by default', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCiaActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical cognition.cia.action_executed percept', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCiaActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.cia.action_executed:run_1',
      });
      expect(arg.create.eventType).toBe(CIA_ACTION_EXECUTED_EVENT_TYPE);
      expect(arg.create.subject).toBe('cia:run:run_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      expect(arg.create.payload).toMatchObject({
        runId: 'run_1',
        executionPath: 'queue',
        candidateCount: 7,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCiaActionExecutedPercept(prisma, logger, {
        ...actionParams,
        workspaceId: '',
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON + outbox throws: swallows the error and warn-logs', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();
      upsert.mockRejectedValueOnce(new Error('db down'));

      const attempted = await emitCiaActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
