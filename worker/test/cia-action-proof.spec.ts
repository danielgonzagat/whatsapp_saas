import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../db';

vi.mock('../db', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    conversation: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    autonomyExecution: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    conversationProofSnapshot: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    autopilotEvent: { create: vi.fn(), findMany: vi.fn() },
    kloelMemory: {
      upsert: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    systemInsight: { create: vi.fn(), findFirst: vi.fn() },
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
  getQueueEvents: vi.fn(() => ({})),
}));

vi.mock('../providers/outbound-dispatcher', () => ({
  dispatchOutboundThroughFlow: vi.fn(async () => ({
    ok: true,
    channel: 'FLOW_SEND_MESSAGE',
    externalId: 'ext-1',
  })),
}));

vi.mock('../providers/plan-limits', () => ({
  PlanLimitsProvider: {
    checkMessageLimit: vi.fn(async () => ({ allowed: true })),
    checkSubscriptionStatus: vi.fn(async () => ({ active: true })),
  },
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

describe('cia-action-proof', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.TEST_AUTOPILOT_SKIP_RATELIMIT = '1';
    process.env.AUTOPILOT_ENFORCE_24H = 'false';

    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        autonomy: { mode: 'LIVE' },
        autopilot: { enabled: true },
        whatsappApiSession: { status: 'connected' },
      },
    });
    mockPrisma.contact.findUnique.mockResolvedValue(null);
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    mockPrisma.contact.update.mockResolvedValue({});
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.message.create.mockResolvedValue({});
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue(null);
    mockPrisma.autonomyExecution.create.mockResolvedValue({ id: 'exec-1' });
    mockPrisma.autonomyExecution.update.mockResolvedValue({ id: 'exec-1', status: 'SUCCESS' });
    mockPrisma.autonomyExecution.findFirst.mockResolvedValue(null);
    mockPrisma.conversationProofSnapshot.create.mockResolvedValue({ id: 'conv-proof-1' });
    mockPrisma.conversationProofSnapshot.update.mockResolvedValue({
      id: 'conv-proof-1',
      status: 'EXECUTED',
    });
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.autopilotEvent.create.mockResolvedValue({});
    mockPrisma.autopilotEvent.findMany.mockResolvedValue([]);
    mockPrisma.kloelMemory.upsert.mockResolvedValue({});
    mockPrisma.kloelMemory.create.mockResolvedValue({});
    mockPrisma.kloelMemory.findMany.mockResolvedValue([]);
    mockPrisma.kloelMemory.findUnique.mockResolvedValue(null);
    mockPrisma.systemInsight.create.mockResolvedValue({});
    mockPrisma.systemInsight.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.TEST_AUTOPILOT_SKIP_RATELIMIT;
    delete process.env.AUTOPILOT_ENFORCE_24H;
  });

  it(
    'persists canonical conversation proof and links execution semantics',
    { timeout: 30000 },
    async () => {
      const { runCiaAction } = await import('../processors/autopilot-processor');

      const result = await runCiaAction({
        workspaceId: 'ws-1',
        type: 'OFFER',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        phone: '5511999999999',
        contactName: 'Luiz',
        cluster: 'HOT',
        priority: 0.91,
        governor: 'EXECUTE',
        reason: 'reactive_backlog_detected',
        confidence: 0.88,
        cycleProofId: 'cycle-1',
        accountProofId: 'account-1',
        conversationActionUniverse: [
          {
            type: 'OFFER',
            governor: 'EXECUTE',
            reason: 'reactive_backlog_detected',
            utility: 0.91,
            confidence: 0.88,
            riskScore: 0.1,
            rewardScore: 0.91,
            executable: true,
            selected: true,
          },
        ],
        conversationTactic: 'PRICE_VALUE_REFRAME',
        conversationTacticUniverse: [
          {
            tactic: 'PRICE_VALUE_REFRAME',
            utility: 0.84,
            executable: true,
            blockedByRule: null,
            reason: 'answer_with_value',
          },
        ],
        cognitiveState: {
          intent: 'QUESTION',
          summary: 'Lead perguntou sobre valor e próximo passo.',
          stage: 'HOT',
          trustScore: 0.62,
          urgencyScore: 0.58,
          priceSensitivity: 0.33,
          objections: ['price'],
          desires: [],
          riskFlags: [],
          paymentState: 'NONE',
          silenceMinutes: 14,
          classificationConfidence: 0.88,
        },
      });

      expect(result).toEqual({ outcome: 'SENT' });
      expect(mockPrisma.conversationProofSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            conversationId: 'conv-1',
            selectedActionType: 'OFFER',
            selectedTactic: 'PRICE_VALUE_REFRAME',
            actionUniverse: expect.any(Array),
            tacticUniverse: expect.any(Array),
          }),
        }),
      );
      expect(mockPrisma.autonomyExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            conversationId: 'conv-1',
            proofId: 'conv-proof-1',
            capabilityCode: 'OFFER',
            tacticCode: 'PRICE_VALUE_REFRAME',
            actionType: 'OFFER',
          }),
        }),
      );
      expect(mockPrisma.conversationProofSnapshot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-proof-1' },
          data: expect.objectContaining({
            status: 'EXECUTED',
            outcome: 'SENT',
          }),
        }),
      );
    },
  );
});
