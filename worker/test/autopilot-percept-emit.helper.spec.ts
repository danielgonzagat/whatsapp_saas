import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitAutopilotActionExecutedPercept,
  AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE,
} from '../processors/autopilot/autopilot-percept-emit.helper';

const FLAG = 'KLOEL_AUTOPILOT_PERCEPT_ENABLED';

function makeDeps() {
  const upsert = vi.fn().mockResolvedValue(undefined);
  const prisma = { mindOutboxEvent: { upsert } } as never;
  const logger = { warn: vi.fn() };
  return { upsert, prisma, logger };
}

describe('emitAutopilotActionExecutedPercept', () => {
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
    vi.clearAllMocks();
  });

  it('flag OFF (default): no outbox write fires and returns false', async () => {
    const { upsert, prisma, logger } = makeDeps();

    const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, {
      workspaceId: 'ws_1',
      actionType: 'CIA_ACTION',
      outcome: 'SENT',
      contactId: 'c_1',
      conversationId: 'conv_1',
      conversationProofId: 'proof_1',
    });

    expect(attempted).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('flag set to a non-"true" value stays inert', async () => {
    process.env[FLAG] = 'false';
    const { upsert, prisma, logger } = makeDeps();

    const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, {
      workspaceId: 'ws_1',
      actionType: 'CIA_ACTION',
      outcome: 'SENT',
      conversationProofId: 'proof_1',
    });

    expect(attempted).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('flag ON: upserts ONE canonical cognition percept into the outbox', async () => {
    process.env[FLAG] = 'true';
    const { upsert, prisma, logger } = makeDeps();

    const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, {
      workspaceId: 'ws_1',
      actionType: 'CIA_ACTION',
      outcome: 'SENT',
      contactId: 'c_1',
      conversationId: 'conv_1',
      conversationProofId: 'proof_1',
    });

    expect(attempted).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);

    const arg = (upsert.mock.calls[0] as unknown[])[0] as {
      where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
      create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
    };
    // Idempotency anchors on the conversation proof when present.
    expect(arg.where.workspaceId_idempotencyKey).toEqual({
      workspaceId: 'ws_1',
      idempotencyKey: 'cognition.autopilot.action_executed:proof_1',
    });
    expect(arg.create.eventType).toBe(AUTOPILOT_ACTION_EXECUTED_EVENT_TYPE);
    expect(arg.create.subject).toBe('contact:c_1');
    expect(arg.create.workspaceId).toBe('ws_1');
    expect(arg.create.payload).toMatchObject({
      actionType: 'CIA_ACTION',
      outcome: 'SENT',
      contactId: 'c_1',
      conversationId: 'conv_1',
      conversationProofId: 'proof_1',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('flag ON but no workspaceId: stays inert (nothing to learn against)', async () => {
    process.env[FLAG] = 'true';
    const { upsert, prisma, logger } = makeDeps();

    const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, {
      workspaceId: '',
      actionType: 'CIA_ACTION',
      outcome: 'SENT',
      conversationProofId: 'proof_1',
    });

    expect(attempted).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('flag ON + outbox throws: swallows the error (never breaks the caller) and warn-logs', async () => {
    process.env[FLAG] = 'true';
    const { upsert, prisma, logger } = makeDeps();
    upsert.mockRejectedValueOnce(new Error('db down'));

    const attempted = await emitAutopilotActionExecutedPercept(prisma, logger, {
      workspaceId: 'ws_1',
      actionType: 'CIA_ACTION',
      outcome: 'FAILED',
      conversationProofId: 'proof_1',
    });

    expect(attempted).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
