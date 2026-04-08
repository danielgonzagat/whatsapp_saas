import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../db';
import { runCycleWorkspace } from '../processors/autopilot-processor';

const { mockDispatchOutbound } = vi.hoisted(() => ({
  mockDispatchOutbound: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../db', () => ({
  prisma: {
    workspace: { findUnique: vi.fn(), findMany: vi.fn() },
    conversation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    contact: { findFirst: vi.fn(), findUnique: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    kloelMemory: { upsert: vi.fn(), create: vi.fn() },
    systemInsight: { findFirst: vi.fn(), create: vi.fn() },
    autopilotEvent: { findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
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

const mockPrisma: any = db.prisma;

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
