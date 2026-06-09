import { describe, expect, it, jest } from '@jest/globals';
import {
  emitPerceptToMindSpine,
  formatUnknownError,
  type PerceptEmitInput,
} from './percept-emit.factory';

function makeDeps() {
  const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const prisma = { mindOutboxEvent: { upsert } } as never;
  const logger = { warn: jest.fn() };
  return { upsert, prisma, logger };
}

function makeInput(overrides: Partial<PerceptEmitInput> = {}): PerceptEmitInput {
  return {
    eventType: 'cognition.test.event',
    workspaceId: 'ws_1',
    subject: 'test:subject:1',
    idempotencyKey: 'cognition.test.event:1',
    payload: { foo: 'bar' },
    failureLog: (formattedError) => `test percept emit failed: ${formattedError}`,
    ...overrides,
  };
}

describe('emitPerceptToMindSpine', () => {
  it('upserts ONE canonical percept on the unique (workspaceId, idempotencyKey) constraint', async () => {
    const { upsert, prisma, logger } = makeDeps();

    await emitPerceptToMindSpine(prisma, logger, makeInput());

    expect(upsert).toHaveBeenCalledTimes(1);

    const arg = (upsert.mock.calls[0] as unknown[])[0] as {
      where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
      update: { eventType: string; subject: string; payload: unknown; occurredAt: Date };
      create: {
        id: string;
        workspaceId: string;
        eventType: string;
        subject: string;
        payload: unknown;
        idempotencyKey: string;
        occurredAt: Date;
      };
    };

    expect(arg.where.workspaceId_idempotencyKey).toEqual({
      workspaceId: 'ws_1',
      idempotencyKey: 'cognition.test.event:1',
    });
    // create carries the full row, update carries the mutable fields — both share
    // the same eventType/subject/payload and a single occurredAt timestamp.
    expect(arg.create.eventType).toBe('cognition.test.event');
    expect(arg.create.subject).toBe('test:subject:1');
    expect(arg.create.workspaceId).toBe('ws_1');
    expect(arg.create.idempotencyKey).toBe('cognition.test.event:1');
    expect(arg.create.payload).toMatchObject({ foo: 'bar' });
    expect(typeof arg.create.id).toBe('string');
    expect(arg.create.id.length).toBeGreaterThan(0);
    expect(arg.update.eventType).toBe('cognition.test.event');
    expect(arg.update.subject).toBe('test:subject:1');
    expect(arg.update.payload).toMatchObject({ foo: 'bar' });
    expect(arg.create.occurredAt).toBe(arg.update.occurredAt);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('best-effort: swallows an upsert error and warn-logs via failureLog (never throws to caller)', async () => {
    const { upsert, prisma, logger } = makeDeps();
    upsert.mockRejectedValueOnce(new Error('db down'));

    await expect(emitPerceptToMindSpine(prisma, logger, makeInput())).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('test percept emit failed: db down');
  });

  it('passes the formatted (not raw) error into failureLog', async () => {
    const { upsert, prisma, logger } = makeDeps();
    upsert.mockRejectedValueOnce('plain string error');

    await emitPerceptToMindSpine(prisma, logger, makeInput());

    expect(logger.warn).toHaveBeenCalledWith('test percept emit failed: plain string error');
  });
});

describe('formatUnknownError', () => {
  it('returns the message for an Error', () => {
    expect(formatUnknownError(new Error('boom'))).toBe('boom');
  });

  it('returns a string error as-is', () => {
    expect(formatUnknownError('raw string')).toBe('raw string');
  });

  it('JSON-serializes a plain object', () => {
    expect(formatUnknownError({ code: 42 })).toBe('{"code":42}');
  });

  it('falls back to Object.prototype.toString for non-serializable values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatUnknownError(circular)).toBe('[object Object]');
  });
});
