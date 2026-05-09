import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCycleWorkspace } from '../processors/autopilot-processor';

type FlexMock = ReturnType<typeof vi.fn>;

const { mockDispatchOutbound } = vi.hoisted(() => ({
  mockDispatchOutbound: vi.fn(async () => ({ ok: true })),
}));

const mockPrisma = vi.hoisted(() => ({
  workspace: { findUnique: vi.fn() as FlexMock, findMany: vi.fn() as FlexMock },
  conversation: {
    findMany: vi.fn() as FlexMock,
    findFirst: vi.fn() as FlexMock,
    update: vi.fn() as FlexMock,
    count: vi.fn() as FlexMock,
  },
  contact: { findFirst: vi.fn() as FlexMock, findUnique: vi.fn() as FlexMock },
  message: {
    findFirst: vi.fn() as FlexMock,
    findMany: vi.fn() as FlexMock,
    create: vi.fn() as FlexMock,
  },
  kloelMemory: { upsert: vi.fn() as FlexMock, create: vi.fn() as FlexMock },
  systemInsight: { findFirst: vi.fn() as FlexMock, create: vi.fn() as FlexMock },
  autopilotEvent: { findMany: vi.fn() as FlexMock, create: vi.fn() as FlexMock },
  auditLog: { create: vi.fn() as FlexMock },
}));

vi.mock('../db', () => ({
  prisma: mockPrisma,
}));

vi.mock('../providers/whatsapp-engine', () => ({
  WhatsAppEngine: {
    sendText: vi.fn(),
    sendMedia: vi.fn(),
  },
}));

vi.mock('../providers/outbound-dispatcher', () => ({
  dispatchOutboundThroughFlow: mockDispatchOutbound,
}));

vi.mock('../providers/plan-limits', () => ({
  PlanLimitsProvider: {
    checkDailyMessageLimit: vi.fn(async () => ({ allowed: true })),
    checkMessageLimit: vi.fn(async () => ({ allowed: true })),
    checkSubscriptionStatus: vi.fn(async () => ({ active: true })),
  },
}));

vi.mock('../queue', () => ({
  connection: {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => null),
  },
  autopilotQueue: { add: vi.fn() },
  flowQueue: { add: vi.fn() },
  voiceQueue: { add: vi.fn() },
  buildQueueOptions: vi.fn(() => ({
    connection: { incr: vi.fn(async () => 1), expire: vi.fn(async () => null) },
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: 50 },
  })),
}));

vi.mock('../redis-client', () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
  },
  redisPub: { publish: vi.fn(async () => 1) },
}));

vi.mock('../providers/channel-dispatcher', () => ({
  channelEnabled: vi.fn(() => false),
  logFallback: vi.fn(),
  sendEmail: vi.fn(),
}));

// PULSE_OK: assertions exist below
describe('cycle-workspace job', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T14:00:00.000Z'));
    vi.clearAllMocks();
    process.env.TEST_AUTOPILOT_SKIP_RATELIMIT = '1';
    process.env.AUTOPILOT_ENFORCE_24H = 'false';
    process.env.ALLOW_PROACTIVE_OUTREACH = 'true';

    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        timezone: 'UTC',
        autonomy: { mode: 'OFF', proactiveEnabled: true },
        autopilot: { enabled: true, proactiveEnabled: true },
        whatsappApiSession: { status: 'connected' },
      },
    });
    mockPrisma.conversation.count.mockResolvedValue(12);
    mockPrisma.autopilotEvent.findMany.mockResolvedValue([
      { meta: { saleApproved: true, amount: 397 } },
    ]);
    mockPrisma.systemInsight.findFirst.mockResolvedValue(null);
    mockPrisma.systemInsight.create.mockResolvedValue({});
    mockPrisma.kloelMemory.upsert.mockResolvedValue({});
    mockPrisma.kloelMemory.create.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.autopilotEvent.create.mockResolvedValue({});
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.contact.findFirst.mockResolvedValue({
      id: 'contact-safe',
      phone: '5511999999999',
      email: null,
      customFields: {},
      workspaceId: 'ws-1',
      name: 'Luiz',
      tags: [],
    });

    const staleDate = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const riskyDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-safe',
        workspaceId: 'ws-1',
        status: 'OPEN',
        unreadCount: 0,
        lastMessageAt: staleDate,
        contact: {
          id: 'contact-safe',
          phone: '5511999999999',
          name: 'Luiz',
          leadScore: 82,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: 'msg-safe-1',
            content: 'quanto custa o produto no pix?',
            direction: 'INBOUND',
            createdAt: staleDate,
          },
        ],
      },
      {
        id: 'conv-risk',
        workspaceId: 'ws-1',
        status: 'OPEN',
        unreadCount: 0,
        lastMessageAt: riskyDate,
        contact: {
          id: 'contact-risk',
          phone: '5511888888888',
          name: 'Marcos',
          leadScore: 95,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: 'msg-risk-1',
            content: 'quero fechar hoje, mas vou abrir processo no procon se isso não resolver',
            direction: 'INBOUND',
            createdAt: riskyDate,
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TEST_AUTOPILOT_SKIP_RATELIMIT;
    delete process.env.AUTOPILOT_ENFORCE_24H;
    delete process.env.ALLOW_PROACTIVE_OUTREACH;
  });

  it('persists business intelligence and escalates risky conversations while still executing safe ones', async () => {
    await runCycleWorkspace('ws-1');

    expect(mockPrisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: 'business_state:current',
          category: 'business_state',
        }),
      }),
    );
    expect(mockPrisma.kloelMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'human_task',
        }),
      }),
    );
    expect(mockPrisma.systemInsight.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: expect.stringMatching(/CIA_/),
        }),
      }),
    );
    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        to: '5511999999999',
        message: expect.any(String),
      }),
    );
  });
});
