import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as db from "../db";
import { runScanContact, runSweepUnreadConversations } from "../processors/autopilot-processor";
import * as unifiedAgentIntegrator from "../providers/unified-agent-integrator";

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

vi.mock("../db", () => ({
  prisma: {
    workspace: { findUnique: vi.fn(), findMany: vi.fn() },
    contact: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    product: { findMany: vi.fn() },
    kloelMemory: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    conversation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
    autopilotEvent: { create: vi.fn() },
    autonomyExecution: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    systemInsight: { findFirst: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(async () => []),
  },
}));

vi.mock("../providers/whatsapp-engine", () => ({
  WhatsAppEngine: {
    sendText: vi.fn(),
    sendMedia: vi.fn(),
  },
}));

vi.mock("../providers/outbound-dispatcher", () => ({
  dispatchOutboundThroughFlow: mockDispatchOutbound,
}));

vi.mock("../providers/plan-limits", () => ({
  PlanLimitsProvider: {
    checkMessageLimit: vi.fn(async () => ({ allowed: true })),
    checkSubscriptionStatus: vi.fn(async () => ({ active: true })),
  },
}));

vi.mock("../queue", () => ({
  connection: {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => null),
  },
  autopilotQueue: { add: vi.fn() },
  flowQueue: { add: vi.fn() },
  voiceQueue: { add: vi.fn() },
}));

vi.mock("../redis-client", () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
  },
  redisPub: { publish: vi.fn(async () => 1) },
}));

vi.mock("../providers/channel-dispatcher", () => ({
  channelEnabled: vi.fn(() => false),
  logFallback: vi.fn(),
  sendEmail: vi.fn(),
  sendTelegram: vi.fn(),
}));

vi.mock("../providers/unified-agent-integrator", () => ({
  processWithUnifiedAgent: mockProcessWithUnifiedAgent,
  shouldUseUnifiedAgent: mockShouldUseUnifiedAgent,
  mapUnifiedActionsToAutopilot: mockMapUnifiedActions,
  extractTextResponse: mockExtractTextResponse,
}));

const mockPrisma: any = db.prisma;

describe("scan-contact job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTOPILOT_ENFORCE_24H = "false";

    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "ws-1",
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: {
          status: "connected",
          phoneNumber: "5511000000000",
        },
      },
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact-1",
      phone: "5511999999999",
      leadScore: 82,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue(null);
    mockPrisma.message.findMany.mockResolvedValue([
      { id: "msg-1", content: "Oi", createdAt: new Date("2026-03-19T10:00:00.000Z") },
      {
        id: "msg-2",
        content: "Quero saber mais sobre o PDRN",
        createdAt: new Date("2026-03-19T10:01:00.000Z"),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([{ name: "PDRN" }]);
    mockPrisma.kloelMemory.findMany.mockResolvedValue([]);
    mockPrisma.kloelMemory.findUnique.mockResolvedValue(null);
    mockPrisma.kloelMemory.upsert.mockResolvedValue({});
    mockPrisma.kloelMemory.create.mockResolvedValue({});
    mockPrisma.autopilotEvent.create.mockResolvedValue({});
    mockPrisma.autonomyExecution.create.mockResolvedValue({ id: "exec-1", status: "PENDING" });
    mockPrisma.autonomyExecution.findFirst.mockResolvedValue(null);
    mockPrisma.autonomyExecution.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.systemInsight.findFirst.mockResolvedValue(null);
    mockPrisma.systemInsight.create.mockResolvedValue({});
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.conversation.count.mockResolvedValue(0);
    mockPrisma.contact.update.mockResolvedValue({});

    mockShouldUseUnifiedAgent.mockReturnValue(false);
    mockProcessWithUnifiedAgent.mockResolvedValue({
      response: "Claro. O PDRN ajuda a regenerar a pele e posso te explicar aplicação, preço e próximos passos.",
      actions: [],
      model: "gpt-5.4",
    });
    mockMapUnifiedActions.mockReturnValue({
      intent: "BUYING",
      action: "NONE",
      reason: "unified_agent:no_tool_needed",
      confidence: 0.94,
      alreadyExecuted: false,
    });
    mockExtractTextResponse.mockReturnValue(
      "Claro. O PDRN ajuda a regenerar a pele e posso te explicar aplicação, preço e próximos passos.",
    );
  });

  afterEach(() => {
    delete process.env.AUTOPILOT_ENFORCE_24H;
    delete process.env.ENFORCE_OPTIN;
  });

  it("aggregates pending inbound messages per contact and sends unified-agent text even without tools", async () => {
    await runScanContact({
      workspaceId: "ws-1",
      contactId: "contact-1",
    });

    expect(unifiedAgentIntegrator.processWithUnifiedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        phone: "5511999999999",
        message: "[1] Oi\n[2] Quero saber mais sobre o PDRN",
        context: expect.objectContaining({
          aggregatedPendingMessages: 2,
          matchedProducts: ["PDRN"],
        }),
      }),
    );
    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        to: "5511999999999",
        message:
          "Claro. O PDRN ajuda a regenerar a pele e posso te explicar aplicação, preço e próximos passos.",
      }),
    );
  });

  it("sends the unified-agent response even when non-sending actions exist", async () => {
    mockShouldUseUnifiedAgent.mockReturnValue(true);
    mockProcessWithUnifiedAgent.mockResolvedValue({
      response: "Atualizei o lead e também vou responder o cliente com contexto útil.",
      actions: [{ tool: "update_lead_status", args: { status: "qualified" } }],
      model: "gpt-5.4",
    });
    mockMapUnifiedActions.mockReturnValue({
      intent: "FOLLOW_UP",
      action: "FOLLOW_UP",
      reason: "unified_agent:update_lead_status",
      confidence: 0.91,
      alreadyExecuted: false,
    });
    mockExtractTextResponse.mockReturnValue(
      "Atualizei o lead e também vou responder o cliente com contexto útil.",
    );

    await runScanContact({
      workspaceId: "ws-1",
      contactId: "contact-1",
      messageId: "msg-live-1",
    });

    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        to: "5511999999999",
        message: "Atualizei o lead e também vou responder o cliente com contexto útil.",
      }),
    );
  });

  it("still sends a reply even when the final action mapping is NONE", async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "ws-2",
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: {
          status: "connected",
          phoneNumber: "5511000000000",
        },
      },
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact-2",
      phone: "5511888888888",
      leadScore: 20,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue(null);
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: "msg-10",
        content: "qual seu nome?",
        createdAt: new Date("2026-03-19T10:05:00.000Z"),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockShouldUseUnifiedAgent.mockReturnValue(false);

    await runScanContact({
      workspaceId: "ws-2",
      contactId: "contact-2",
    });

    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-2",
        to: "5511888888888",
        message: expect.any(String),
      }),
    );
  });

  it("escalates risky support cases to human review instead of sending autonomously", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: "conv-risk-1",
      mode: "AI",
      status: "OPEN",
    });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: "msg-risk-1",
        content: "vou abrir reclamação no procon se isso não resolver hoje",
        createdAt: new Date("2026-03-19T10:05:00.000Z"),
      },
    ]);

    await runScanContact({
      workspaceId: "ws-1",
      contactId: "contact-1",
      messageId: "msg-risk-1",
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.kloelMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "human_task",
        }),
      }),
    );
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mode: "HUMAN",
        }),
      }),
    );
  });

  it("bypasses 24h and opt-in compliance for reactive WhatsApp replies", async () => {
    process.env.AUTOPILOT_ENFORCE_24H = "true";
    process.env.ENFORCE_OPTIN = "true";

    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "ws-3",
      providerSettings: {
        autopilot: { enabled: true, requireOptIn: true },
        whatsappApiSession: { status: "connected" },
      },
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact-3",
      phone: "5511777777777",
      leadScore: 15,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-15T10:05:00.000Z"),
    });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: "msg-20",
        content: "quero continuar com isso agora",
        createdAt: new Date("2026-03-19T10:05:00.000Z"),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockShouldUseUnifiedAgent.mockReturnValue(false);

    await runScanContact({
      workspaceId: "ws-3",
      contactId: "contact-3",
      messageId: "msg-inbound-1",
    });

    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-3",
        to: "5511777777777",
        message: expect.any(String),
      }),
    );
  });

  it("does not bypass 24h and opt-in compliance for backlog runs without inbound trigger", async () => {
    process.env.AUTOPILOT_ENFORCE_24H = "true";
    process.env.ENFORCE_OPTIN = "true";

    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "ws-4",
      providerSettings: {
        autopilot: { enabled: true, requireOptIn: true },
        whatsappApiSession: { status: "connected" },
      },
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact-4",
      phone: "5511666666666",
      leadScore: 45,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-15T10:05:00.000Z"),
    });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: "msg-30",
        content: "quero retomar isso",
        createdAt: new Date("2026-03-19T10:05:00.000Z"),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockShouldUseUnifiedAgent.mockReturnValue(false);

    await runScanContact({
      workspaceId: "ws-4",
      contactId: "contact-4",
      runId: "run-older-backlog",
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "skipped",
          reason: expect.stringMatching(/optin_required|session_expired_24h/),
        }),
      }),
    );
  });

  it("bypasses 24h and opt-in compliance when backlog processing explicitly marks the job as reactive", async () => {
    process.env.AUTOPILOT_ENFORCE_24H = "true";
    process.env.ENFORCE_OPTIN = "true";

    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "ws-5",
      providerSettings: {
        autopilot: { enabled: true, requireOptIn: true },
        whatsappApiSession: { status: "connected" },
      },
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact-5",
      phone: "5511555555555",
      leadScore: 45,
      customFields: {},
      tags: [],
    });
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: new Date("2026-03-15T10:05:00.000Z"),
    });
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: "msg-40",
        content: "quero retomar isso agora",
        createdAt: new Date("2026-03-19T10:05:00.000Z"),
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockShouldUseUnifiedAgent.mockReturnValue(false);

    await runScanContact({
      workspaceId: "ws-5",
      contactId: "contact-5",
      runId: "run-reactive-backlog",
      deliveryMode: "reactive",
    });

    expect(mockDispatchOutbound).toHaveBeenCalledTimes(1);
    expect(mockDispatchOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-5",
        to: "5511555555555",
      }),
    );
  });

  it("does not send when the conversation is locked for human handling", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: "conv-human-1",
      mode: "HUMAN",
      status: "OPEN",
    });

    await runScanContact({
      workspaceId: "ws-1",
      contactId: "contact-1",
      messageId: "msg-human-lock",
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SCAN_CONTACT",
          status: "skipped",
          reason: "human_mode_lock",
        }),
      }),
    );
  });

  it("does not send when the conversation is assigned to a human operator", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: "conv-human-2",
      mode: "AI",
      status: "OPEN",
      assignedAgentId: "operator-1",
    });

    await runScanContact({
      workspaceId: "ws-1",
      contactId: "contact-1",
      messageId: "msg-human-owner",
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SCAN_CONTACT",
          status: "skipped",
          reason: "assigned_to_human",
        }),
      }),
    );
  });

  it("blocks reactive replies when the contact explicitly opted out", async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact-optout",
      phone: "5511555555555",
      leadScore: 12,
      optIn: false,
      customFields: {},
      tags: [],
    });

    await runScanContact({
      workspaceId: "ws-1",
      contactId: "contact-optout",
      messageId: "msg-optout-1",
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "skipped",
          reason: "opted_out",
        }),
      }),
    );
  });

  it("skips duplicate sends when the ledger already has a successful execution", async () => {
    mockPrisma.autonomyExecution.create.mockRejectedValueOnce({ code: "P2002" });
    mockPrisma.autonomyExecution.findFirst.mockResolvedValueOnce({
      id: "exec-existing",
      status: "SUCCESS",
    });

    await runScanContact({
      workspaceId: "ws-1",
      contactId: "contact-1",
      messageId: "msg-duplicate-1",
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "skipped",
          reason: "duplicate_execution_success",
        }),
      }),
    );
  });

  it("never sends a reply to the workspace own phone", async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "ws-1",
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: {
          status: "connected",
          phoneNumber: "5511999999999",
        },
      },
    });

    await runScanContact({
      workspaceId: "ws-1",
      contactId: "contact-1",
      messageId: "msg-self-1",
    });

    expect(mockDispatchOutbound).not.toHaveBeenCalled();
    expect(mockPrisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "skipped",
          reason: "workspace_self_contact",
        }),
      }),
    );
  });

  it("queues unread conversations for backlog sweep even when the last stored message is outbound", async () => {
    const queueModule = await import("../queue");
    const redisClient = await import("../redis-client");

    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-2",
        contactId: "contact-2",
        status: "OPEN",
        mode: "AI",
        assignedAgentId: null,
        unreadCount: 1,
        lastMessageAt: new Date("2026-03-19T10:02:00.000Z"),
        messages: [
          {
            direction: "INBOUND",
            createdAt: new Date("2026-03-19T10:02:00.000Z"),
          },
        ],
        contact: {
          id: "contact-2",
          name: "Marcos",
          phone: "5511888888888",
        },
      },
      {
        id: "conv-1",
        contactId: "contact-1",
        status: "OPEN",
        mode: "AI",
        assignedAgentId: null,
        unreadCount: 3,
        lastMessageAt: new Date("2026-03-19T10:01:00.000Z"),
        messages: [
          {
            direction: "INBOUND",
            createdAt: new Date("2026-03-19T10:01:00.000Z"),
          },
        ],
        contact: {
          id: "contact-1",
          name: "Luiz",
          phone: "5511999999999",
        },
      },
      {
        id: "conv-outbound",
        contactId: "contact-3",
        status: "OPEN",
        mode: "AI",
        assignedAgentId: null,
        unreadCount: 8,
        lastMessageAt: new Date("2026-03-19T10:03:00.000Z"),
        messages: [
          {
            direction: "OUTBOUND",
            createdAt: new Date("2026-03-19T10:03:00.000Z"),
          },
        ],
        contact: {
          id: "contact-3",
          name: "Ainda Pendente",
          phone: "5511777777777",
        },
      },
      {
        id: "conv-human-owner",
        contactId: "contact-4",
        status: "OPEN",
        mode: "AI",
        assignedAgentId: "operator-9",
        unreadCount: 6,
        lastMessageAt: new Date("2026-03-19T10:04:00.000Z"),
        messages: [
          {
            direction: "INBOUND",
            createdAt: new Date("2026-03-19T10:04:00.000Z"),
          },
        ],
        contact: {
          id: "contact-4",
          name: "Com Humano",
          phone: "5511666666666",
        },
      },
    ]);

    await runSweepUnreadConversations({
      workspaceId: "ws-1",
      runId: "run-123",
      mode: "reply_all_recent_first",
      limit: 10,
    });

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-1",
          status: { not: "CLOSED" },
        }),
        orderBy: [{ lastMessageAt: "desc" }],
        take: 50,
      }),
    );
    expect(queueModule.autopilotQueue.add).toHaveBeenNthCalledWith(
      1,
      "scan-contact",
      expect.objectContaining({
        workspaceId: "ws-1",
        runId: "run-123",
        deliveryMode: "reactive",
        contactId: "contact-3",
        contactName: "Ainda Pendente",
        backlogIndex: 1,
        backlogTotal: 3,
      }),
      expect.objectContaining({
        jobId: "scan-contact__ws-1__contact-3__run__run-123",
      }),
    );
    expect(queueModule.autopilotQueue.add).toHaveBeenNthCalledWith(
      2,
      "scan-contact",
      expect.objectContaining({
        workspaceId: "ws-1",
        runId: "run-123",
        deliveryMode: "reactive",
        contactId: "contact-2",
        contactName: "Marcos",
        backlogIndex: 2,
        backlogTotal: 3,
      }),
      expect.objectContaining({
        jobId: "scan-contact__ws-1__contact-2__run__run-123",
      }),
    );
    expect(queueModule.autopilotQueue.add).toHaveBeenNthCalledWith(
      3,
      "scan-contact",
      expect.objectContaining({
        workspaceId: "ws-1",
        runId: "run-123",
        deliveryMode: "reactive",
        contactId: "contact-1",
        contactName: "Luiz",
        backlogIndex: 3,
        backlogTotal: 3,
      }),
      expect.objectContaining({
        jobId: "scan-contact__ws-1__contact-1__run__run-123",
      }),
    );
    expect(redisClient.redisPub.publish).toHaveBeenCalledWith(
      "ws:agent",
      expect.stringContaining('"phase":"queue_start"'),
    );
  });

  it("filters the workspace own phone out of the backlog queue", async () => {
    const queueModule = await import("../queue");

    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "ws-1",
      providerSettings: {
        whatsappApiSession: {
          status: "connected",
          phoneNumber: "5511777777777",
        },
      },
    });
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-self",
        contactId: "contact-self",
        status: "OPEN",
        mode: "AI",
        assignedAgentId: null,
        unreadCount: 7,
        lastMessageAt: new Date("2026-03-19T10:05:00.000Z"),
        messages: [
          {
            direction: "INBOUND",
            createdAt: new Date("2026-03-19T10:05:00.000Z"),
          },
        ],
        contact: {
          id: "contact-self",
          name: "Eu Mesmo",
          phone: "5511777777777",
          customFields: {},
        },
      },
      {
        id: "conv-customer",
        contactId: "contact-customer",
        status: "OPEN",
        mode: "AI",
        assignedAgentId: null,
        unreadCount: 2,
        lastMessageAt: new Date("2026-03-19T10:04:00.000Z"),
        messages: [
          {
            direction: "INBOUND",
            createdAt: new Date("2026-03-19T10:04:00.000Z"),
          },
        ],
        contact: {
          id: "contact-customer",
          name: "Cliente",
          phone: "5511666666666",
          customFields: {},
        },
      },
    ]);

    await runSweepUnreadConversations({
      workspaceId: "ws-1",
      runId: "run-self-filter",
      mode: "reply_all_recent_first",
      limit: 10,
    });

    expect(queueModule.autopilotQueue.add).toHaveBeenCalledTimes(1);
    expect(queueModule.autopilotQueue.add).toHaveBeenCalledWith(
      "scan-contact",
      expect.objectContaining({
        contactId: "contact-customer",
        phone: "5511666666666",
      }),
      expect.anything(),
    );
  });
});
