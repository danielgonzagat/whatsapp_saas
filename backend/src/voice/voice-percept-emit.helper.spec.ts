import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  VOICE_ACTION_EXECUTED_EVENT_TYPE,
  VOICE_CLONE_CREATED_EVENT_TYPE,
  emitVoiceActionExecutedPercept,
  emitVoiceCloneCreatedPercept,
} from './voice-percept-emit.helper';

const FLAG = 'KLOEL_VOICE_PERCEPT_ENABLED';

function makeDeps() {
  const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const prisma = { mindOutboxEvent: { upsert } } as never;
  const logger = { warn: jest.fn() };
  return { upsert, prisma, logger };
}

const cloneParams = {
  workspaceId: 'ws_1',
  profileId: 'vp_1',
  provider: 'OPENAI',
};

const actionParams = {
  workspaceId: 'ws_1',
  jobId: 'job_1',
  profileId: 'vp_1',
  textLength: 42,
};

describe('voice percept emit helpers', () => {
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

  describe('emitVoiceCloneCreatedPercept', () => {
    it('flag default (unset): emits — cognition loop ON by default', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitVoiceCloneCreatedPercept(prisma, logger, cloneParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag set to a non-"true" value stays inert', async () => {
      process.env[FLAG] = 'false';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitVoiceCloneCreatedPercept(prisma, logger, cloneParams);

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical cognition.voice.clone_created percept', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitVoiceCloneCreatedPercept(prisma, logger, cloneParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.voice.clone_created:vp_1',
      });
      expect(arg.create.eventType).toBe(VOICE_CLONE_CREATED_EVENT_TYPE);
      expect(arg.create.subject).toBe('voice:profile:vp_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      expect(arg.create.payload).toMatchObject({
        profileId: 'vp_1',
        provider: 'OPENAI',
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitVoiceCloneCreatedPercept(prisma, logger, {
        ...cloneParams,
        workspaceId: '',
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON + outbox throws: swallows the error and warn-logs', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();
      upsert.mockRejectedValueOnce(new Error('db down'));

      const attempted = await emitVoiceCloneCreatedPercept(prisma, logger, cloneParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitVoiceActionExecutedPercept', () => {
    it('flag default (unset): emits — cognition loop ON by default', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitVoiceActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical cognition.voice.action_executed percept', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitVoiceActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.voice.action_executed:job_1',
      });
      expect(arg.create.eventType).toBe(VOICE_ACTION_EXECUTED_EVENT_TYPE);
      expect(arg.create.subject).toBe('voice:job:job_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      expect(arg.create.payload).toMatchObject({
        jobId: 'job_1',
        profileId: 'vp_1',
        textLength: 42,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitVoiceActionExecutedPercept(prisma, logger, {
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

      const attempted = await emitVoiceActionExecutedPercept(prisma, logger, actionParams);

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
