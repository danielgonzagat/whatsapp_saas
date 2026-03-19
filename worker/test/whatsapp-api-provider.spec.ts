import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { whatsappApiProvider } from "../providers/whatsapp-api-provider";

describe("whatsappApiProvider", () => {
  const originalEnv = {
    WAHA_API_URL: process.env.WAHA_API_URL,
    WAHA_BASE_URL: process.env.WAHA_BASE_URL,
    WAHA_URL: process.env.WAHA_URL,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.WAHA_API_URL;
    delete process.env.WAHA_BASE_URL;
    delete process.env.WAHA_URL;
  });

  afterEach(() => {
    process.env.WAHA_API_URL = originalEnv.WAHA_API_URL;
    process.env.WAHA_BASE_URL = originalEnv.WAHA_BASE_URL;
    process.env.WAHA_URL = originalEnv.WAHA_URL;
  });

  it("throws when WAHA URL is not configured instead of using a hidden default", async () => {
    await expect(
      whatsappApiProvider.sendText({ id: "ws-1" }, "5511999999999", "Oi"),
    ).rejects.toThrow("WAHA_API_URL/WAHA_BASE_URL/WAHA_URL not configured");
  });
});
