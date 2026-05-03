import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as db from '../db';
import { runScanContact } from '../processors/autopilot-processor';
import * as unifiedAgentIntegrator from '../providers/unified-agent-integrator';
import * as queueModule from '../queue';
import * as redisClientModule from '../redis-client';
import { setMockContact, setupDefaultMocks } from './__parts__/scan-contact.setup';
import { addSweepTests } from './__parts__/scan-contact.cases.sweep';

const {
  mockDispatchOutbound,
  mockProcessWithUnifiedAgent,
  mockShouldUseUnifiedAgent,
  mockMapUnifiedActions,
  mockExtractTextResponse,
} = vi.hoisted(() => ({
  mockDispatchOutbound: vi.fn(async () => ({ ok: true })),
  mockProcessWithUnifiedAgent: vi.fn(),
  mockShouldUseUnifiedAgent: vi.fn(),
  mockMapUnifiedActions: vi.fn(),
  mockExtractTextResponse: vi.fn(),
}));

vi.mock('../db', () => ({
  prisma: {
    workspace: { findUnique: vi.fn(), findMany: vi.fn() },
    contact: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    product: { findMany: vi.fn() },
    kloelMemory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    autopilotEvent: { create: vi.fn() },
    autonomyExecution: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    systemInsight: { findFirst: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(async () => []),
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

vi.mock('../providers/unified-agent-integrator', () => ({
  processWithUnifiedAgent: mockProcessWithUnifiedAgent,
  shouldUseUnifiedAgent: mockShouldUseUnifiedAgent,
  mapUnifiedActionsToAutopilot: mockMapUnifiedActions,
  extractTextResponse: mockExtractTextResponse,
}));

const mockPrisma: any = db.prisma;

describe('scan-contact job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTOPILOT_ENFORCE_24H = 'false';

    setupDefaultMocks(
      mockPrisma,
      mockProcessWithUnifiedAgent,
      mockShouldUseUnifiedAgent,
      mockMapUnifiedActions,
      mockExtractTextResponse,
    );
  });

  afterEach(() => {
    delete process.env.AUTOPILOT_ENFORCE_24H;
    delete process.env.ENFORCE_OPTIN;
  });

  it('aggregates pending inbound messages per contact and sends unified-agent text even without tools', async () => {
    await runScanContact({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
    });

    expect(unifiedAgentIntegrator.processWithUnifiedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '5511999999999',
        message: '[1] Oi\n[2] Quero saber mais sobre o serum',
        context: expect.objectContaining({
          aggregatedPendingMessages: 2,
          matchedProducts: ['Test Product'],
        }),
      }),
    );
    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        to: '5511999999999',
        message:
          'Claro. O serum ajuda a regenerar a pele e posso te explicar aplicação, preço e próximos passos.',
      }),
    );
  });

  it('sends the unified-agent response even when non-sending actions exist', async () => {
    mockShouldUseUnifiedAgent.mockReturnValue(true);
    mockProcessWithUnifiedAgent.mockResolvedValue({
      response: 'Atualizei o lead e também vou responder o cliente com contexto útil.',
      actions: [{ tool: 'update_lead_status', args: { status: 'qualified' } }],
      model: 'gpt-5.4',
    });
    mockMapUnifiedActions.mockReturnValue({
      intent: 'FOLLOW_UP',
      action: 'FOLLOW_UP',
      reason: 'unified_agent:update_lead_status',
      confidence: 0.91,
      alreadyExecuted: false,
    });
    mockExtractTextResponse.mockReturnValue(
      'Atualizei o lead e também vou responder o cliente com contexto útil.',
    );

    await runScanContact({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      messageId: 'msg-live-1',
    });

    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        to: '5511999999999',
        message: 'Atualizei o lead e também vou responder o cliente com contexto útil.',
      }),
    );
  });

  it('still sends a reply even when the final action mapping is NONE', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-2',
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: {
          status: 'connected',
          phoneNumber: '5511000000000',
        },
      },
    });
    setMockContact(mockPrisma, {
      id: 'contact-2',
      phone: '5511888888888',
      leadScore: 20,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue(null);
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-10',
        content: 'qual seu nome?',
        createdAt: new Date('2026-03-19T10:05:00.000Z'),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockShouldUseUnifiedAgent.mockReturnValue(false);

    await runScanContact({
      workspaceId: 'ws-2',
      contactId: 'contact-2',
    });

    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-2',
        to: '5511888888888',
        message: expect.any(String),
      }),
    );
  });

  it('escalates risky support cases to human review instead of sending autonomously', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-risk-1',
      mode: 'AI',
      status: 'OPEN',
    });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-risk-1',
        content: 'vou abrir reclamação no procon se isso não resolver hoje',
        createdAt: new Date('2026-03-19T10:05:00.000Z'),
      },
    ]);

    await runScanContact({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      messageId: 'msg-risk-1',
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.kloelMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'human_task',
        }),
      }),
    );
    expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
        }),
        data: expect.objectContaining({
          mode: 'HUMAN',
        }),
      }),
    );
  });

  it('bypasses 24h and opt-in compliance for reactive WhatsApp replies', async () => {
    process.env.AUTOPILOT_ENFORCE_24H = 'true';
    process.env.ENFORCE_OPTIN = 'true';

    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-3',
      providerSettings: {
        autopilot: { enabled: true, requireOptIn: true },
        whatsappApiSession: { status: 'connected' },
      },
    });
    setMockContact(mockPrisma, {
      id: 'contact-3',
      phone: '5511777777777',
      leadScore: 15,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date('2026-03-15T10:05:00.000Z'),
    });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-20',
        content: 'quero continuar com isso agora',
        createdAt: new Date('2026-03-19T10:05:00.000Z'),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockShouldUseUnifiedAgent.mockReturnValue(false);

    await runScanContact({
      workspaceId: 'ws-3',
      contactId: 'contact-3',
      messageId: 'msg-inbound-1',
    });

    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-3',
        to: '5511777777777',
        message: expect.any(String),
      }),
    );
  });

  it('does not bypass 24h and opt-in compliance for backlog runs without inbound trigger', async () => {
    process.env.AUTOPILOT_ENFORCE_24H = 'true';
    process.env.ENFORCE_OPTIN = 'true';

    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-4',
      providerSettings: {
        autopilot: { enabled: true, requireOptIn: true },
        whatsappApiSession: { status: 'connected' },
      },
    });
    setMockContact(mockPrisma, {
      id: 'contact-4',
      phone: '5511666666666',
      leadScore: 45,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date('2026-03-15T10:05:00.000Z'),
    });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-30',
        content: 'quero retomar isso',
        createdAt: new Date('2026-03-19T10:05:00.000Z'),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockShouldUseUnifiedAgent.mockReturnValue(false);

    await runScanContact({
      workspaceId: 'ws-4',
      contactId: 'contact-4',
      runId: 'run-older-backlog',
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'skipped',
          reason: expect.stringMatching(/optin_required|session_expired_24h/),
        }),
      }),
    );
  });

  it('bypasses 24h and opt-in compliance when backlog processing explicitly marks the job as reactive', async () => {
    process.env.AUTOPILOT_ENFORCE_24H = 'true';
    process.env.ENFORCE_OPTIN = 'true';

    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-5',
      providerSettings: {
        autopilot: { enabled: true, requireOptIn: true },
        whatsappApiSession: { status: 'connected' },
      },
    });
    setMockContact(mockPrisma, {
      id: 'contact-5',
      phone: '5511555555555',
      leadScore: 45,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date('2026-03-15T10:05:00.000Z'),
    });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-40',
        content: 'quero retomar isso agora',
        createdAt: new Date('2026-03-19T10:05:00.000Z'),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockShouldUseUnifiedAgent.mockReturnValue(false);

    await runScanContact({
      workspaceId: 'ws-5',
      contactId: 'contact-5',
      runId: 'run-reactive-backlog',
      deliveryMode: 'reactive',
    });

    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-5',
        to: '5511555555555',
      }),
    );
  });

  it('does not send when the conversation is locked for human handling', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-human-1',
      mode: 'HUMAN',
      status: 'OPEN',
    });

    await runScanContact({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      messageId: 'msg-human-lock',
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SCAN_CONTACT',
          status: 'skipped',
          reason: 'human_mode_lock',
        }),
      }),
    );
  });

  it('does not send when the conversation is assigned to a human operator', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-human-2',
      mode: 'AI',
      status: 'OPEN',
      assignedAgentId: 'operator-1',
    });

    await runScanContact({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      messageId: 'msg-human-owner',
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SCAN_CONTACT',
          status: 'skipped',
          reason: 'assigned_to_human',
        }),
      }),
    );
  });

  it('blocks reactive replies when the contact explicitly opted out', async () => {
    setMockContact(mockPrisma, {
      id: 'contact-optout',
      phone: '5511555555555',
      leadScore: 12,
      optIn: false,
      customFields: {},
      tags: [],
    });

    await runScanContact({
      workspaceId: 'ws-1',
      contactId: 'contact-optout',
      messageId: 'msg-optout-1',
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'skipped',
          reason: 'opted_out',
        }),
      }),
    );
  });

  it('skips duplicate sends when the ledger already has a successful execution', async () => {
    mockPrisma.autonomyExecution.create.mockRejectedValueOnce({ code: 'P2002' });
    mockPrisma.autonomyExecution.findFirst.mockResolvedValueOnce({
      id: 'exec-existing',
      status: 'SUCCESS',
    });

    await runScanContact({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      messageId: 'msg-duplicate-1',
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'skipped',
          reason: 'duplicate_execution_success',
        }),
      }),
    );
  });

  it('never sends a reply to the workspace own phone', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: {
          status: 'connected',
          phoneNumber: '5511999999999',
        },
      },
    });

    await runScanContact({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      messageId: 'msg-self-1',
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).not.toHaveBeenCalled();
  });

  addSweepTests(mockPrisma, queueModule, redisClientModule);
});
