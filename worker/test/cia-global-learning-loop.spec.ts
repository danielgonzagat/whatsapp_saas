import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../db';
import { runCiaGlobalLearningAll } from '../processors/autopilot-processor';
import { redis } from '../redis-client';

vi.mock('../db', () => ({
  prisma: {
    workspace: { findMany: vi.fn() },
    kloelMemory: { findMany: vi.fn() },
    systemInsight: { findFirst: vi.fn(), create: vi.fn() },
    conversation: { findMany: vi.fn(), count: vi.fn() },
    contact: { findFirst: vi.fn(), findUnique: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    autopilotEvent: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('../providers/whatsapp-engine', () => ({
  WhatsAppEngine: {
    sendText: vi.fn(),
    sendMedia: vi.fn(),
  },
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
    del: vi.fn(async () => 1),
  },
  redisPub: { publish: vi.fn(async () => 1) },
}));

vi.mock('../providers/channel-dispatcher', () => ({
  channelEnabled: vi.fn(() => false),
  logFallback: vi.fn(),
  sendEmail: vi.fn(),
}));

const mockPrisma: any = db.prisma;

describe('cia-global-learning-loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.workspace.findMany.mockResolvedValue([
      {
        id: 'ws-1',
        providerSettings: {
          autopilot: { enabled: true },
          businessInfo: { segment: 'Suplementos' },
        },
      },
      {
        id: 'ws-2',
        providerSettings: {
          autopilot: { enabled: true },
          businessInfo: { segment: 'Suplementos' },
        },
      },
    ]);
    mockPrisma.kloelMemory.findMany
      .mockResolvedValueOnce([
        {
          createdAt: '2026-03-19T09:00:00.000Z',
          value: {
            intent: 'BUYING',
            message: 'Serum no pix por R$397',
            outcome: 'SOLD',
            priority: 88,
            variantKey: 'followup:proof',
            metadata: { revenue: 397 },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: '2026-03-19T10:00:00.000Z',
          value: {
            intent: 'BUYING',
            message: 'Ainda tenho interesse no serum',
            outcome: 'REPLIED',
            priority: 61,
            variantKey: 'followup:direct',
            metadata: { revenue: 0 },
          },
        },
      ]);
    mockPrisma.systemInsight.findFirst.mockResolvedValue(null);
    mockPrisma.systemInsight.create.mockResolvedValue({});
  });

  it('aggregates anonymized patterns and persists workspace insights', async () => {
    const result = await runCiaGlobalLearningAll();

    expect(result).toEqual(
      expect.objectContaining({
        workspacesAnalyzed: 2,
        signalsAnalyzed: 2,
        patternsAvailable: 1,
      }),
    );
    expect(redis.set).toHaveBeenCalledWith(
      'cia:global-patterns:v1',
      expect.stringContaining('"domain":"suplementos"'),
    );
    expect(mockPrisma.systemInsight.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CIA_GLOBAL_LEARNING',
        }),
      }),
    );
  });
});
