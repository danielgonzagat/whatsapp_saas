import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFollowupContact } from '../processors/autopilot-processor';

type FlexMock = ReturnType<typeof vi.fn>;

const { mockDispatchOutbound } = vi.hoisted(() => ({
  mockDispatchOutbound: vi.fn(async () => ({ ok: true })),
}));

const mockPrisma = vi.hoisted(() => ({
  workspace: { findUnique: vi.fn() as FlexMock },
  conversation: { findFirst: vi.fn() as FlexMock },
  contact: { findFirst: vi.fn() as FlexMock, findUnique: vi.fn() as FlexMock },
  message: {
    findFirst: vi.fn() as FlexMock,
    findMany: vi.fn() as FlexMock,
    create: vi.fn() as FlexMock,
  },
  kloelMemory: { upsert: vi.fn() as FlexMock, create: vi.fn() as FlexMock },
  systemInsight: { findFirst: vi.fn() as FlexMock, create: vi.fn() as FlexMock },
  auditLog: { create: vi.fn() as FlexMock },
  autopilotEvent: { create: vi.fn() as FlexMock },
  autonomyExecution: {
    create: vi.fn() as FlexMock,
    findFirst: vi.fn() as FlexMock,
    update: vi.fn() as FlexMock,
  },
}));

vi.mock('../db', () => ({
  prisma: mockPrisma,
}));

vi.mock('../providers/whatsapp-engine', () => ({
  WhatsAppEngine: { sendText: vi.fn() },
}));

vi.mock('../providers/outbound-dispatcher', () => ({
  dispatchOutboundThroughFlow: mockDispatchOutbound,
}));

vi.mock('../providers/plan-limits', () => ({
  PlanLimitsProvider: {
    checkDailyMessageLimit: vi.fn(async () => ({ allowed: true })),
    checkMessageLimit: vi.fn(async () => ({ allowed: true })),
  },
}));

vi.mock('../queue', () => ({
  connection: {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => null),
  },
  autopilotQueue: { add: vi.fn() },
  flowQueue: { add: vi.fn() },
  buildQueueOptions: vi.fn(() => ({
    connection: { incr: vi.fn(async () => 1), expire: vi.fn(async () => null) },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  })),
}));

vi.mock('../redis-client', () => ({
  redis: {
    set: vi.fn(async () => 'OK'),
  },
  redisPub: { publish: vi.fn(async () => 1) },
}));

describe('followup-contact job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    process.env.TEST_AUTOPILOT_SKIP_RATELIMIT = '1';
    process.env.AUTOPILOT_ENFORCE_24H = 'false';
    process.env.ALLOW_PROACTIVE_OUTREACH = 'true';

    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        autopilot: { enabled: true, proactiveEnabled: true },
        timezone: 'UTC',
      },
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: 'c1',
      phone: '123',
      email: null,
      customFields: {},
      workspaceId: 'ws',
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue({ externalId: 'wamid-1' });
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.kloelMemory.upsert.mockResolvedValue({});
    mockPrisma.kloelMemory.create.mockResolvedValue({});
    mockPrisma.systemInsight.findFirst.mockResolvedValue(null);
    mockPrisma.systemInsight.create.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.autopilotEvent.create.mockResolvedValue({});
    mockPrisma.autonomyExecution.create.mockResolvedValue({ id: 'exec-1', status: 'PENDING' });
    mockPrisma.autonomyExecution.findFirst.mockResolvedValue(null);
    mockPrisma.autonomyExecution.update.mockResolvedValue({});
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ALLOW_PROACTIVE_OUTREACH;
  });

  it('sends ghost closer when buying signal and no inbound since scheduling', async () => {
    const scheduledAt = new Date(Date.now() - 60 * 60 * 1000);
    mockPrisma.conversation.findFirst.mockResolvedValue({
      workspaceId: 'ws',
      contact: { id: 'c1', phone: '123' },
      messages: [
        {
          content: 'quanto custa',
          createdAt: new Date(Date.now() - 30 * 60 * 1000),
          direction: 'OUTBOUND',
        },
      ],
      workspace: { providerSettings: {} },
    });

    await runFollowupContact({
      workspaceId: 'ws',
      contactId: 'c1',
      phone: '123',
      scheduledAt: scheduledAt.toISOString(),
    });
    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
  });

  it('skips when inbound reply arrived after scheduling', async () => {
    const scheduledAt = new Date(Date.now() - 60 * 60 * 1000);
    mockPrisma.conversation.findFirst.mockResolvedValue({
      workspaceId: 'ws',
      contact: { id: 'c1', phone: '123' },
      messages: [{ content: 'resposta', createdAt: new Date(), direction: 'INBOUND' }],
      workspace: { providerSettings: {} },
    });

    await runFollowupContact({
      workspaceId: 'ws',
      contactId: 'c1',
      phone: '123',
      scheduledAt: scheduledAt.toISOString(),
    });
    expect(mockDispatchOutbound).not.toHaveBeenCalled();
  });

  it('skips when the conversation is locked in HUMAN mode', async () => {
    const scheduledAt = new Date(Date.now() - 60 * 60 * 1000);
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-human-1',
      workspaceId: 'ws',
      mode: 'HUMAN',
      contact: { id: 'c1', phone: '123' },
      messages: [{ content: 'quanto custa', createdAt: new Date(), direction: 'OUTBOUND' }],
      workspace: { providerSettings: {} },
    });

    await runFollowupContact({
      workspaceId: 'ws',
      contactId: 'c1',
      phone: '123',
      scheduledAt: scheduledAt.toISOString(),
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FOLLOWUP_CONTACT',
          status: 'skipped',
          reason: 'human_mode_lock',
        }),
      }),
    );
  });

  it('skips when proactive outreach is not explicitly allowed', async () => {
    delete process.env.ALLOW_PROACTIVE_OUTREACH;
    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        autopilot: { enabled: true, proactiveEnabled: true },
        timezone: 'UTC',
      },
    });
    mockPrisma.conversation.findFirst.mockResolvedValue({
      workspaceId: 'ws',
      contact: { id: 'c1', phone: '123' },
      messages: [
        {
          content: 'quanto custa',
          createdAt: new Date(Date.now() - 30 * 60 * 1000),
          direction: 'OUTBOUND',
        },
      ],
      workspace: { providerSettings: {} },
    });

    const result = await runFollowupContact({
      workspaceId: 'ws',
      contactId: 'c1',
      phone: '123',
      scheduledAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    expect(result).toBe('skipped');
    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FOLLOWUP_CONTACT',
          status: 'skipped',
          reason: 'proactive_outreach_disabled',
        }),
      }),
    );
  });
});
