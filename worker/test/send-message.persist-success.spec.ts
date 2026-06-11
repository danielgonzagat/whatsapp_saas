import { beforeEach, describe, expect, it, vi } from 'vitest';

import { persistSuccess, type PersistSuccessInput } from '../send-message.persist-success';

type Mock = ReturnType<typeof vi.fn>;

const buildDeps = (overrides?: { findFirst?: Mock; create?: Mock }) => {
  const findFirst = overrides?.findFirst ?? vi.fn().mockResolvedValue(null);
  const create =
    overrides?.create ??
    vi.fn().mockResolvedValue({ id: 'msg-1', createdAt: new Date('2026-06-10T00:00:00Z') });
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const publish = vi.fn().mockResolvedValue(1);
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { findFirst, create, updateMany, publish, log };
};

const buildInput = (
  deps: ReturnType<typeof buildDeps>,
  overrides?: Partial<PersistSuccessInput>,
): PersistSuccessInput => ({
  prisma: {
    message: { create: deps.create, findFirst: deps.findFirst },
    conversation: { updateMany: deps.updateMany },
  },
  redisPub: { publish: deps.publish },
  log: deps.log as unknown as PersistSuccessInput['log'],
  workspaceId: 'ws-1',
  contactId: 'contact-1',
  conversationId: 'conv-1',
  content: 'hello',
  msgType: 'TEXT',
  mediaUrl: undefined,
  providerError: null,
  externalId: 'wamid.123',
  ...overrides,
});

describe('persistSuccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the message and publishes inbox events when no duplicate exists', async () => {
    const deps = buildDeps();

    await persistSuccess(buildInput(deps));

    expect(deps.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalId: 'wamid.123' },
      select: { id: true },
    });
    expect(deps.create).toHaveBeenCalledTimes(1);
    expect(deps.updateMany).toHaveBeenCalledTimes(1);
    // message:new + conversation:update + message:status
    expect(deps.publish).toHaveBeenCalledTimes(3);
  });

  it('skips create and publishes when the (workspaceId, externalId) row already exists (F1-B dedupe)', async () => {
    const deps = buildDeps({
      findFirst: vi.fn().mockResolvedValue({ id: 'already-persisted' }),
    });

    await persistSuccess(buildInput(deps));

    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.updateMany).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.log.info).toHaveBeenCalledWith(
      'send_persist_skipped_duplicate',
      expect.objectContaining({
        workspaceId: 'ws-1',
        externalId: 'wamid.123',
        existingMessageId: 'already-persisted',
      }),
    );
  });

  it('preserves legacy behavior when externalId is absent (no lookup, always create)', async () => {
    const deps = buildDeps();

    await persistSuccess(buildInput(deps, { externalId: null }));

    expect(deps.findFirst).not.toHaveBeenCalled();
    expect(deps.create).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(3);
  });

  it('treats a P2002 unique-violation race on create as an already-persisted duplicate', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const deps = buildDeps({
      create: vi.fn().mockRejectedValue(p2002),
    });

    await persistSuccess(buildInput(deps));

    expect(deps.updateMany).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.log.warn).not.toHaveBeenCalled();
    expect(deps.log.info).toHaveBeenCalledWith(
      'send_persist_skipped_duplicate',
      expect.objectContaining({ workspaceId: 'ws-1', externalId: 'wamid.123', race: true }),
    );
  });

  it('still rethrows-to-warn on non-P2002 create failures (legacy behavior)', async () => {
    const deps = buildDeps({
      create: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(persistSuccess(buildInput(deps))).resolves.toBeUndefined();

    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.log.warn).toHaveBeenCalledWith('send_persist_failed', { error: 'db down' });
  });
});
