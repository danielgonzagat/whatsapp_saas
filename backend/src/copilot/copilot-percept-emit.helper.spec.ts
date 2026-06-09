import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  COPILOT_CHAT_REPLY_EVENT_TYPE,
  emitCopilotChatReplyPercept,
} from './copilot-percept-emit.helper';

const FLAG = 'KLOEL_COPILOT_PERCEPT_ENABLED';

function makeDeps() {
  const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const prisma = { mindOutboxEvent: { upsert } } as never;
  const logger = { warn: jest.fn() };
  return { upsert, prisma, logger };
}

const replyParams = {
  workspaceId: 'ws_1',
  conversationId: 'contact_1',
  turn: 7,
  replyLength: 120,
  replyOutcome: 1 as const,
};

describe('copilot percept emit helpers', () => {
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

  describe('emitCopilotChatReplyPercept', () => {
    it('flag default (unset): emits — cognition loop ON by default', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCopilotChatReplyPercept(prisma, logger, replyParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag set to "false" stays inert', async () => {
      process.env[FLAG] = 'false';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCopilotChatReplyPercept(prisma, logger, replyParams);

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical cognition.copilot.chat_reply percept', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCopilotChatReplyPercept(prisma, logger, replyParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.copilot.chat_reply:contact_1:7',
      });
      expect(arg.create.eventType).toBe(COPILOT_CHAT_REPLY_EVENT_TYPE);
      expect(arg.create.subject).toBe('copilot:conversation:contact_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      expect(arg.create.payload).toMatchObject({
        conversationId: 'contact_1',
        turn: 7,
        replyLength: 120,
        replyOutcome: 1,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON + degraded outcome (0): records the degraded reply percept', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCopilotChatReplyPercept(prisma, logger, {
        ...replyParams,
        replyOutcome: 0,
      });

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        create: { payload: { replyOutcome: number } };
      };
      expect(arg.create.payload.replyOutcome).toBe(0);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitCopilotChatReplyPercept(prisma, logger, {
        ...replyParams,
        workspaceId: '',
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON + outbox throws: swallows the error and warn-logs', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();
      upsert.mockRejectedValueOnce(new Error('db down'));

      const attempted = await emitCopilotChatReplyPercept(prisma, logger, replyParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
