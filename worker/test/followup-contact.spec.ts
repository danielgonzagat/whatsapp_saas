import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as db from '../db';
import { runFollowupContact } from '../processors/autopilot-processor';

const { mockDispatchOutbound } = vi.hoisted(() => ({
  mockDispatchOutbound: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../db', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    conversation: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn(), findUnique: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    kloelMemory: { upsert: vi.fn(), create: vi.fn() },
    systemInsight: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    autopilotEvent: { create: vi.fn() },
    autonomyExecution: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
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
}));

vi.mock('../redis-client', () => ({
  redis: {
    set: vi.fn(async () => 'OK'),
  },
  redisPub: { publish: vi.fn(async () => 1) },
}));

const mockPrisma: any = db.prisma;

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
