import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as db from "../db";
import { runScanContact } from "../processors/autopilot-processor";
import * as unifiedAgentIntegrator from "../providers/unified-agent-integrator";

const {
  mockSendText,
  mockProcessWithUnifiedAgent,
  mockShouldUseUnifiedAgent,
  mockMapUnifiedActions,
  mockExtractTextResponse,
} = vi.hoisted(() => ({
  mockSendText: vi.fn(),
  mockProcessWithUnifiedAgent: vi.fn(),
  mockShouldUseUnifiedAgent: vi.fn(),
  mockMapUnifiedActions: vi.fn(),
  mockExtractTextResponse: vi.fn(),
}));

vi.mock("../db", () => ({
  prisma: {
    workspace: { findUnique: vi.fn(), findMany: vi.fn() },
    contact: { findFirst: vi.fn(), findUnique: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    product: { findMany: vi.fn() },
    kloelMemory: { findMany: vi.fn() },
    conversation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    autopilotEvent: { create: vi.fn() },
    $queryRaw: vi.fn(async () => []),
  },
}));

vi.mock("../providers/whatsapp-engine", () => ({
  WhatsAppEngine: {
    sendText: mockSendText,
    sendMedia: vi.fn(),
  },
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
    set: vi.fn(async () => "OK"),
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
        autopilot: { enabled: false },
        whatsappApiSession: { status: "connected" },
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
    mockPrisma.autopilotEvent.create.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    mockShouldUseUnifiedAgent.mockReturnValue(false);
    mockProcessWithUnifiedAgent.mockResolvedValue({
      response: "Claro. O PDRN ajuda a regenerar a pele e posso te explicar aplicação, preço e próximos passos.",
      actions: [],
      model: "gpt-4o",
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
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-1" }),
      "5511999999999",
      "Claro. O PDRN ajuda a regenerar a pele e posso te explicar aplicação, preço e próximos passos.",
    );
  });

  it("never stays silent when decision would otherwise be NONE", async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "ws-2",
      providerSettings: {
        autopilot: { enabled: false },
        whatsappApiSession: { status: "connected" },
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

    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ws-2" }),
      "5511888888888",
      expect.stringContaining("Kloel"),
    );
  });
});
