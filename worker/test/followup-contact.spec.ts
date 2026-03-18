import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as db from "../db";
import { runFollowupContact } from "../processors/autopilot-processor";

const { mockSendText } = vi.hoisted(() => ({
  mockSendText: vi.fn(),
}));

vi.mock("../db", () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    conversation: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn(), findUnique: vi.fn() },
    message: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    autopilotEvent: { create: vi.fn() },
  },
}));

vi.mock("../providers/whatsapp-engine", () => ({
  WhatsAppEngine: { sendText: mockSendText },
}));

vi.mock("../providers/plan-limits", () => ({
  PlanLimitsProvider: {
    checkMessageLimit: vi.fn(async () => ({ allowed: true })),
  },
}));

vi.mock("../queue", () => ({
  connection: {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => null),
  },
  autopilotQueue: { add: vi.fn() },
  flowQueue: { add: vi.fn() },
}));

vi.mock("../redis-client", () => ({
  redisPub: { publish: vi.fn(async () => 1) },
}));

const mockPrisma: any = db.prisma;

describe("followup-contact job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T10:00:00.000Z"));
    process.env.TEST_AUTOPILOT_SKIP_RATELIMIT = "1";
    process.env.AUTOPILOT_ENFORCE_24H = "false";

    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { autopilot: { enabled: true } },
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "c1",
      phone: "123",
      email: null,
      customFields: {},
      workspaceId: "ws",
      tags: [],
    });
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.autopilotEvent.create.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends ghost closer when buying signal and no inbound since scheduling", async () => {
    const scheduledAt = new Date(Date.now() - 60 * 60 * 1000);
    mockPrisma.conversation.findFirst.mockResolvedValue({
      workspaceId: "ws",
      contact: { id: "c1", phone: "123" },
      messages: [{ content: "quanto custa", createdAt: new Date(Date.now() - 30 * 60 * 1000), direction: "OUTBOUND" }],
      workspace: { providerSettings: {} },
    });

    await runFollowupContact({
      workspaceId: "ws",
      contactId: "c1",
      phone: "123",
      scheduledAt: scheduledAt.toISOString(),
    });
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it("skips when inbound reply arrived after scheduling", async () => {
    const scheduledAt = new Date(Date.now() - 60 * 60 * 1000);
    mockPrisma.conversation.findFirst.mockResolvedValue({
      workspaceId: "ws",
      contact: { id: "c1", phone: "123" },
      messages: [{ content: "resposta", createdAt: new Date(), direction: "INBOUND" }],
      workspace: { providerSettings: {} },
    });

    await runFollowupContact({
      workspaceId: "ws",
      contactId: "c1",
      phone: "123",
      scheduledAt: scheduledAt.toISOString(),
    });
    expect(mockSendText).not.toHaveBeenCalled();
  });
});
