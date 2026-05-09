// Ensure autopilot window covers all hours so tests run at any time of day
process.env.AUTOPILOT_WINDOW_START = '0';
process.env.AUTOPILOT_WINDOW_END = '24';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCiaCycleWorkspace } from '../processors/autopilot-processor';
import { autopilotQueue } from '../queue';

type FlexMock = ReturnType<typeof vi.fn>;

const mockPrisma = vi.hoisted(() => ({
  workspace: { findUnique: vi.fn() as FlexMock, findMany: vi.fn() as FlexMock },
  conversation: { findMany: vi.fn() as FlexMock, count: vi.fn() as FlexMock },
  contact: { findFirst: vi.fn() as FlexMock, findUnique: vi.fn() as FlexMock },
  message: {
    findFirst: vi.fn() as FlexMock,
    findMany: vi.fn() as FlexMock,
    create: vi.fn() as FlexMock,
  },
  kloelMemory: {
    upsert: vi.fn() as FlexMock,
    create: vi.fn() as FlexMock,
    findMany: vi.fn() as FlexMock,
    findUnique: vi.fn() as FlexMock,
  },
  agentWorkItem: { findMany: vi.fn() as FlexMock },
  accountProofSnapshot: { create: vi.fn() as FlexMock },
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
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  },
  redisPub: { publish: vi.fn(async () => 1) },
}));

vi.mock('../providers/channel-dispatcher', () => ({
  channelEnabled: vi.fn(() => false),
  logFallback: vi.fn(),
  sendEmail: vi.fn(),
}));

describe('cia-cycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T15:00:00.000Z'));
    process.env.TEST_AUTOPILOT_SKIP_RATELIMIT = '1';
    process.env.AUTOPILOT_ENFORCE_24H = 'false';

    mockPrisma.workspace.findUnique.mockResolvedValue({
      name: 'Workspace 1',
      providerSettings: {
        autonomy: { mode: 'LIVE' },
        autopilot: { enabled: true },
        whatsappApiSession: { status: 'connected' },
      },
    });
    mockPrisma.conversation.count.mockResolvedValue(8);
    mockPrisma.autopilotEvent.findMany.mockResolvedValue([
      { meta: { saleApproved: true, amount: 397 } },
    ]);
    mockPrisma.kloelMemory.findMany.mockResolvedValue([]);
    mockPrisma.kloelMemory.findUnique.mockResolvedValue(null);
    mockPrisma.kloelMemory.upsert.mockResolvedValue({});
    mockPrisma.kloelMemory.create.mockResolvedValue({});
    mockPrisma.agentWorkItem.findMany.mockResolvedValue([
      {
        id: 'work-1',
        workspaceId: 'ws-1',
        kind: 'conversation_reply',
        entityType: 'contact',
        entityId: 'contact-hot',
        state: 'OPEN',
        priority: 98,
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.accountProofSnapshot.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'proof-1', ...data }),
    );
    mockPrisma.systemInsight.create.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.autopilotEvent.create.mockResolvedValue({});

    const now = new Date();
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-hot',
        workspaceId: 'ws-1',
        status: 'OPEN',
        unreadCount: 3,
        lastMessageAt: now,
        contact: {
          id: 'contact-hot',
          phone: '5511999999999',
          name: 'Luiz',
          leadScore: 85,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: 'msg-hot',
            content: 'quanto custa o produto no pix?',
            direction: 'INBOUND',
            createdAt: now,
          },
        ],
      },
      {
        id: 'conv-pay',
        workspaceId: 'ws-1',
        status: 'OPEN',
        unreadCount: 0,
        lastMessageAt: new Date(Date.now() - 30 * 60 * 1000),
        contact: {
          id: 'contact-pay',
          phone: '5511888888888',
          name: 'Marcos',
          leadScore: 92,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: 'msg-pay',
            content: 'o pix ainda esta pendente?',
            direction: 'INBOUND',
            createdAt: now,
          },
        ],
      },
      {
        id: 'conv-warm',
        workspaceId: 'ws-1',
        status: 'OPEN',
        unreadCount: 0,
        lastMessageAt: new Date(Date.now() - 40 * 60 * 60 * 1000),
        contact: {
          id: 'contact-warm',
          phone: '5511777777777',
          name: 'Ana',
          leadScore: 50,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: 'msg-warm',
            content: 'estou pensando ainda',
            direction: 'INBOUND',
            createdAt: now,
          },
        ],
      },
      {
        id: 'conv-cold-outbound',
        workspaceId: 'ws-1',
        status: 'OPEN',
        unreadCount: 0,
        lastMessageAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
        contact: {
          id: 'contact-cold',
          phone: '5511666666666',
          name: 'Carlos',
          leadScore: 35,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: 'msg-cold',
            content: 'te mandei as condições ontem',
            direction: 'OUTBOUND',
            createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TEST_AUTOPILOT_SKIP_RATELIMIT;
    delete process.env.AUTOPILOT_ENFORCE_24H;
  });

  it('builds a global cycle and dispatches multiple prioritized cia actions', async () => {
    const result = await runCiaCycleWorkspace('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        queued: 3,
        guaranteeReport: expect.objectContaining({
          guaranteed: true,
        }),
        exhaustionReport: expect.objectContaining({
          exhaustive: true,
          silentCount: 0,
          noLegalActions: false,
        }),
        cycleProofId: expect.any(String),
      }),
    );
    expect(mockPrisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: 'business_state:current',
        }),
      }),
    );
    expect(mockPrisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: 'cia_cycle_proof:current',
          category: 'cia_cycle_proof',
        }),
      }),
    );
    expect(mockPrisma.accountProofSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          proofType: 'CIA_CYCLE',
          cycleProofId: expect.any(String),
          workItemUniverse: expect.any(Array),
          actionUniverse: expect.any(Array),
          executedActions: expect.any(Array),
          metadata: expect.objectContaining({
            tacticUniverse: expect.any(Array),
          }),
        }),
      }),
    );
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'cia-action',
      expect.objectContaining({
        workspaceId: 'ws-1',
        type: 'PAYMENT_RECOVERY',
        cycleProofId: expect.any(String),
        accountProofId: 'proof-1',
        conversationTactic: expect.any(String),
        conversationActionUniverse: expect.any(Array),
      }),
      expect.any(Object),
    );
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      'cia-action',
      expect.objectContaining({
        workspaceId: 'ws-1',
        type: expect.stringMatching(/RESPOND|OFFER|ASK_CLARIFYING|SOCIAL_PROOF/),
      }),
      expect.any(Object),
    );
  });
});
