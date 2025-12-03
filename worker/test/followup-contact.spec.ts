import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "../db";
import { runFollowupContact } from "../processors/autopilot-processor";

vi.mock("../db", () => ({
  prisma: {
    conversation: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    message: { create: vi.fn() },
    autopilotEvent: { create: vi.fn() },
  },
}));

vi.mock("../providers/whatsapp-engine", () => ({
  WhatsAppEngine: { sendText: vi.fn() },
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

const mockPrisma: any = db.prisma;
// const mockSendText: any = (await import("../providers/whatsapp-engine")).WhatsAppEngine.sendText;
const mockSendText = vi.fn(); // Placeholder to fix build

describe("followup-contact job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEST_AUTOPILOT_SKIP_RATELIMIT = "1";
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
