import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

const prismaMock = {
  contact: { upsert: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  message: { findFirst: vi.fn(), create: vi.fn() },
};
vi.mock('../db', () => ({ prisma: prismaMock }));

const publishMock = vi.fn();
vi.mock('../redis-client', () => ({ redisPub: { publish: publishMock } }));

const getProviderForUserMock = vi.fn();
vi.mock('../providers/registry', () => ({
  ProviderRegistry: { getProviderForUser: getProviderForUserMock },
}));

vi.mock('../providers/rate-limiter', () => ({
  RateLimiter: {
    checkLimit: vi.fn().mockResolvedValue(true),
    checkNumberLimit: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../providers/watchdog', () => ({
  Watchdog: {
    isHealthy: vi.fn().mockResolvedValue(true),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    reportError: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../providers/health-monitor', () => ({
  HealthMonitor: {
    updateMetrics: vi.fn().mockResolvedValue(undefined),
    reportStatus: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Subject ────────────────────────────────────────────────────────────

type SendMessageFn = (
  deps: {
    log: {
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };
    sleep: (ms: number) => Promise<void>;
  },
  user: string,
  text: string,
  workspaceId?: string,
) => Promise<Record<string, unknown>>;

let sendMessage: SendMessageFn;

beforeAll(async () => {
  const mod = await import('../flow-message-sender.helpers');
  sendMessage = mod.sendMessage as unknown as SendMessageFn;
});

const buildDeps = () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sleep: vi.fn().mockResolvedValue(undefined),
});

const sendResult = { messages: [{ id: 'wamid.123' }] };

const arrangeHappyPath = (overrides?: { sendResult?: Record<string, unknown> }) => {
  getProviderForUserMock.mockResolvedValue({
    workspace: { id: 'ws-1' },
    sendText: vi.fn().mockResolvedValue(overrides?.sendResult ?? sendResult),
  });
  prismaMock.contact.upsert.mockResolvedValue({ id: 'contact-1' });
  prismaMock.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
  prismaMock.conversation.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.message.findFirst.mockResolvedValue(null);
  prismaMock.message.create.mockResolvedValue({
    id: 'msg-1',
    createdAt: new Date('2026-06-10T00:00:00Z'),
  });
  publishMock.mockResolvedValue(1);
};

describe('flow-message-sender sendMessage — F1-B outbound dedupe (campaign/flow path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the message and publishes inbox events when no duplicate exists', async () => {
    arrangeHappyPath();
    const deps = buildDeps();

    await sendMessage(deps as never, '5511999999999', 'hello');

    expect(prismaMock.message.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', externalId: 'wamid.123' },
      select: { id: true },
    });
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.conversation.updateMany).toHaveBeenCalledTimes(1);
    // message:new + conversation:update + message:status
    expect(publishMock).toHaveBeenCalledTimes(3);
  });

  it('skips create, conversation touch, and publishes when the (workspaceId, externalId) row already exists (F1-B dedupe)', async () => {
    arrangeHappyPath();
    prismaMock.message.findFirst.mockResolvedValue({ id: 'already-persisted' });
    const deps = buildDeps();

    const result = await sendMessage(deps as never, '5511999999999', 'hello');

    expect(result).toEqual(sendResult);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
    expect(prismaMock.conversation.updateMany).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
    expect(deps.log.info).toHaveBeenCalledWith(
      'send_persist_skipped_duplicate',
      expect.objectContaining({
        workspaceId: 'ws-1',
        conversationId: 'conv-1',
        externalId: 'wamid.123',
        existingMessageId: 'already-persisted',
      }),
    );
  });

  it('preserves legacy behavior when externalId is absent (no lookup, always create)', async () => {
    arrangeHappyPath({ sendResult: { status: 'ok' } });
    const deps = buildDeps();

    await sendMessage(deps as never, '5511999999999', 'hello');

    expect(prismaMock.message.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ externalId: null }) }),
    );
    expect(publishMock).toHaveBeenCalledTimes(3);
  });

  it('treats a P2002 unique-violation race on create as an already-persisted duplicate', async () => {
    arrangeHappyPath();
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prismaMock.message.create.mockRejectedValue(p2002);
    const deps = buildDeps();

    const result = await sendMessage(deps as never, '5511999999999', 'hello');

    expect(result).toEqual(sendResult);
    expect(prismaMock.conversation.updateMany).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
    expect(deps.log.warn).not.toHaveBeenCalled();
    expect(deps.log.info).toHaveBeenCalledWith(
      'send_persist_skipped_duplicate',
      expect.objectContaining({
        workspaceId: 'ws-1',
        externalId: 'wamid.123',
        race: true,
      }),
    );
  });

  it('still warn-swallows non-P2002 create failures (legacy persist_outbound_failed path)', async () => {
    arrangeHappyPath();
    prismaMock.message.create.mockRejectedValue(new Error('db down'));
    const deps = buildDeps();

    const result = await sendMessage(deps as never, '5511999999999', 'hello');

    expect(result).toEqual(sendResult);
    expect(publishMock).not.toHaveBeenCalled();
    expect(deps.log.warn).toHaveBeenCalledWith('persist_outbound_failed', { error: 'db down' });
  });
});
