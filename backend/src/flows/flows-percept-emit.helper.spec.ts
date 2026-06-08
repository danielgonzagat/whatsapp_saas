import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  emitFlowNodeCompletedPercept,
  FLOW_NODE_COMPLETED_EVENT_TYPE,
} from './flows-percept-emit.helper';

const FLAG = 'KLOEL_FLOWS_PERCEPT_ENABLED';

function makeDeps() {
  const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const prisma = { mindOutboxEvent: { upsert } } as never;
  const logger = { warn: jest.fn() };
  return { upsert, prisma, logger };
}

describe('emitFlowNodeCompletedPercept', () => {
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

  it('flag default (unset): emits — cognition loop ON by default', async () => {
    const { upsert, prisma, logger } = makeDeps();

    const attempted = await emitFlowNodeCompletedPercept(prisma, logger, {
      workspaceId: 'ws_1',
      flowId: 'flow_1',
      executionId: 'exec_1',
      nodeCount: 3,
    });

    expect(attempted).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('flag set to a non-"true" value stays inert', async () => {
    process.env[FLAG] = 'false';
    const { upsert, prisma, logger } = makeDeps();

    const attempted = await emitFlowNodeCompletedPercept(prisma, logger, {
      workspaceId: 'ws_1',
      flowId: 'flow_1',
      executionId: 'exec_1',
      nodeCount: 3,
    });

    expect(attempted).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('flag ON: upserts ONE canonical cognition percept into the outbox', async () => {
    process.env[FLAG] = 'true';
    const { upsert, prisma, logger } = makeDeps();

    const attempted = await emitFlowNodeCompletedPercept(prisma, logger, {
      workspaceId: 'ws_1',
      flowId: 'flow_1',
      executionId: 'exec_1',
      nodeCount: 3,
    });

    expect(attempted).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);

    const arg = (upsert.mock.calls[0] as unknown[])[0] as {
      where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
      create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
    };
    expect(arg.where.workspaceId_idempotencyKey).toEqual({
      workspaceId: 'ws_1',
      idempotencyKey: 'cognition.flow.node_completed:exec_1',
    });
    expect(arg.create.eventType).toBe(FLOW_NODE_COMPLETED_EVENT_TYPE);
    expect(arg.create.subject).toBe('flow:flow_1');
    expect(arg.create.workspaceId).toBe('ws_1');
    expect(arg.create.payload).toMatchObject({
      flowId: 'flow_1',
      executionId: 'exec_1',
      nodeCount: 3,
      status: 'COMPLETED',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('flag ON but no workspaceId: stays inert (nothing to learn against)', async () => {
    process.env[FLAG] = 'true';
    const { upsert, prisma, logger } = makeDeps();

    const attempted = await emitFlowNodeCompletedPercept(prisma, logger, {
      workspaceId: '',
      flowId: 'flow_1',
      executionId: 'exec_1',
      nodeCount: 3,
    });

    expect(attempted).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('flag ON + outbox throws: swallows the error (never breaks the caller) and warn-logs', async () => {
    process.env[FLAG] = 'true';
    const { upsert, prisma, logger } = makeDeps();
    upsert.mockRejectedValueOnce(new Error('db down'));

    const attempted = await emitFlowNodeCompletedPercept(prisma, logger, {
      workspaceId: 'ws_1',
      flowId: 'flow_1',
      executionId: 'exec_1',
      nodeCount: 3,
    });

    expect(attempted).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
