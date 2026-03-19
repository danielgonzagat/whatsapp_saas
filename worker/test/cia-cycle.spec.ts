import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../db";
import { runCiaCycleWorkspace } from "../processors/autopilot-processor";
import { autopilotQueue } from "../queue";

vi.mock("../db", () => ({
  prisma: {
    workspace: { findUnique: vi.fn(), findMany: vi.fn() },
    conversation: { findMany: vi.fn(), count: vi.fn() },
    contact: { findFirst: vi.fn(), findUnique: vi.fn() },
    message: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    kloelMemory: {
      upsert: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    systemInsight: { findFirst: vi.fn(), create: vi.fn() },
    autopilotEvent: { findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../providers/whatsapp-engine", () => ({
  WhatsAppEngine: {
    sendText: vi.fn(),
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

const mockPrisma: any = db.prisma;
describe("cia-cycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEST_AUTOPILOT_SKIP_RATELIMIT = "1";
    process.env.AUTOPILOT_ENFORCE_24H = "false";

    mockPrisma.workspace.findUnique.mockResolvedValue({
      name: "Workspace 1",
      providerSettings: {
        autopilot: { enabled: true },
        whatsappApiSession: { status: "connected" },
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
    mockPrisma.systemInsight.create.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.autopilotEvent.create.mockResolvedValue({});

    const now = new Date();
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-hot",
        workspaceId: "ws-1",
        status: "OPEN",
        unreadCount: 3,
        lastMessageAt: now,
        contact: {
          id: "contact-hot",
          phone: "5511999999999",
          name: "Luiz",
          leadScore: 85,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: "msg-hot",
            content: "quanto custa o pdrn no pix?",
            direction: "INBOUND",
            createdAt: now,
          },
        ],
      },
      {
        id: "conv-pay",
        workspaceId: "ws-1",
        status: "OPEN",
        unreadCount: 0,
        lastMessageAt: new Date(Date.now() - 30 * 60 * 1000),
        contact: {
          id: "contact-pay",
          phone: "5511888888888",
          name: "Marcos",
          leadScore: 92,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: "msg-pay",
            content: "o pix ainda esta pendente?",
            direction: "INBOUND",
            createdAt: now,
          },
        ],
      },
      {
        id: "conv-warm",
        workspaceId: "ws-1",
        status: "OPEN",
        unreadCount: 0,
        lastMessageAt: new Date(Date.now() - 40 * 60 * 60 * 1000),
        contact: {
          id: "contact-warm",
          phone: "5511777777777",
          name: "Ana",
          leadScore: 50,
          customFields: {},
          email: null,
        },
        messages: [
          {
            id: "msg-warm",
            content: "estou pensando ainda",
            direction: "INBOUND",
            createdAt: now,
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    delete process.env.TEST_AUTOPILOT_SKIP_RATELIMIT;
    delete process.env.AUTOPILOT_ENFORCE_24H;
  });

  it("builds a global cycle and dispatches multiple prioritized cia actions", async () => {
    const result = await runCiaCycleWorkspace("ws-1");

    expect(result).toEqual(
      expect.objectContaining({
        queued: 3,
        guaranteeReport: expect.objectContaining({
          guaranteed: true,
        }),
      }),
    );
    expect(mockPrisma.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: "business_state:current",
        }),
      }),
    );
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      "cia-action",
      expect.objectContaining({
        workspaceId: "ws-1",
        type: "PAYMENT_RECOVERY",
      }),
      expect.any(Object),
    );
    expect(autopilotQueue.add).toHaveBeenCalledWith(
      "cia-action",
      expect.objectContaining({
        workspaceId: "ws-1",
        type: "RESPOND",
      }),
      expect.any(Object),
    );
  });
});
