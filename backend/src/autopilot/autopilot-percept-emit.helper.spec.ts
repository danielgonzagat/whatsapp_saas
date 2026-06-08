import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE,
  AUTOPILOT_DECISION_MADE_EVENT_TYPE,
  emitAutopilotActionExecutedPercept,
  emitAutopilotDecisionMadePercept,
} from './autopilot-percept-emit.helper';

const FLAG = 'KLOEL_AUTOPILOT_PERCEPT_ENABLED';

function makeDeps() {
  const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const prisma = { mindOutboxEvent: { upsert } } as never;
  const logger = { warn: jest.fn() };
  return { upsert, prisma, logger };
}

const decisionParams = {
  workspaceId: 'ws_1',
  conversationId: 'conv_1',
  chosenAction: 'send_offer',
  baselineAction: 'ai_chat',
  mindInfluenced: true,
};

const actionParams = {
  workspaceId: 'ws_1',
  conversationId: 'conv_1',
  action: 'send_offer',
  complianceAllowed: true,
  intent: 'buying',
};

describe('autopilot percept emit helpers', () => {
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

  describe('emitAutopilotDecisionMadePercept', () => {
    it('flag default (unset): emits — cognition loop ON by default', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitAutopilotDecisionMadePercept(prisma, logger, decisionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag set to a non-"true" value stays inert', async () => {
      process.env[FLAG] = 'false';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitAutopilotDecisionMadePercept(prisma, logger, decisionParams);

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical cognition.autopilot.decision_made percept', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitAutopilotDecisionMadePercept(prisma, logger, decisionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.autopilot.decision_made:conv_1:send_offer',
      });
      expect(arg.create.eventType).toBe(AUTOPILOT_DECISION_MADE_EVENT_TYPE);
      expect(arg.create.subject).toBe('autopilot:conversation:conv_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      expect(arg.create.payload).toMatchObject({
        conversationId: 'conv_1',
        chosenAction: 'send_offer',
        baselineAction: 'ai_chat',
        mindInfluenced: true,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitAutopilotDecisionMadePercept(prisma, logger, {
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

      const attempted = await emitAutopilotDecisionMadePercept(prisma, logger, decisionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitAutopilotActionExecutedPercept', () => {
    it('flag default (unset): emits — cognition loop ON by default', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical cognition.autopilot.action_executed percept', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.autopilot.action_executed:conv_1:send_offer',
      });
      expect(arg.create.eventType).toBe(AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE);
      expect(arg.create.subject).toBe('autopilot:conversation:conv_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      expect(arg.create.payload).toMatchObject({
        conversationId: 'conv_1',
        action: 'send_offer',
        complianceAllowed: true,
        intent: 'buying',
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, {
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

      const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
