import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockProviderSendText,
  mockProviderSendMedia,
  mockFallbackSendText,
  mockFallbackSendMedia,
  mockCheckSubscriptionStatus,
  mockCheckMessageLimit,
  mockApply,
  mockPushAlert,
} = vi.hoisted(() => ({
  mockProviderSendText: vi.fn(),
  mockProviderSendMedia: vi.fn(),
  mockFallbackSendText: vi.fn(),
  mockFallbackSendMedia: vi.fn(),
  mockCheckSubscriptionStatus: vi.fn(),
  mockCheckMessageLimit: vi.fn(),
  mockApply: vi.fn(),
  mockPushAlert: vi.fn(),
}));

vi.mock("../providers/whatsapp-api-provider", () => ({
  whatsappApiProvider: {
    sendText: mockProviderSendText,
    sendMedia: mockProviderSendMedia,
  },
}));

vi.mock("../providers/auto-provider", () => ({
  autoProvider: {
    sendText: mockFallbackSendText,
    sendMedia: mockFallbackSendMedia,
  },
}));

vi.mock("../providers/plan-limits", () => ({
  PlanLimitsProvider: {
    checkSubscriptionStatus: mockCheckSubscriptionStatus,
    checkMessageLimit: mockCheckMessageLimit,
  },
}));

vi.mock("../providers/anti-ban", () => ({
  AntiBan: {
    apply: mockApply,
  },
}));

vi.mock("../providers/health-monitor", () => ({
  HealthMonitor: {
    pushAlert: mockPushAlert,
  },
}));

import { WhatsAppEngine } from "../providers/whatsapp-engine";

describe("WhatsAppEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckSubscriptionStatus.mockResolvedValue({ active: true });
    mockCheckMessageLimit.mockResolvedValue({ allowed: true });
    mockApply.mockResolvedValue(undefined);
    mockPushAlert.mockResolvedValue(undefined);
  });

  it("falls back when WAHA provider returns an error payload instead of success", async () => {
    mockProviderSendText.mockResolvedValue({ error: "waha_send_failed" });
    mockFallbackSendText.mockResolvedValue({ success: true, id: "fallback-1" });

    const result = await WhatsAppEngine.sendText(
      { id: "ws-1" },
      "5511999999999",
      "Oi",
    );

    expect(mockFallbackSendText).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, id: "fallback-1" });
  });
});
