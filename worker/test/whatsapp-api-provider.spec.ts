import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("whatsappApiProvider", () => {
  const originalEnv = {
    WAHA_API_URL: process.env.WAHA_API_URL,
    WAHA_BASE_URL: process.env.WAHA_BASE_URL,
    WAHA_URL: process.env.WAHA_URL,
    WAHA_SINGLE_SESSION: process.env.WAHA_SINGLE_SESSION,
    WAHA_SESSION_ID: process.env.WAHA_SESSION_ID,
  };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.WAHA_API_URL;
    delete process.env.WAHA_BASE_URL;
    delete process.env.WAHA_URL;
    delete process.env.WAHA_SINGLE_SESSION;
    delete process.env.WAHA_SESSION_ID;
  });

  afterEach(() => {
    process.env.WAHA_API_URL = originalEnv.WAHA_API_URL;
    process.env.WAHA_BASE_URL = originalEnv.WAHA_BASE_URL;
    process.env.WAHA_URL = originalEnv.WAHA_URL;
    process.env.WAHA_SINGLE_SESSION = originalEnv.WAHA_SINGLE_SESSION;
    process.env.WAHA_SESSION_ID = originalEnv.WAHA_SESSION_ID;
    global.fetch = originalFetch;
  });

  it("throws when WAHA URL is not configured instead of using a hidden default", async () => {
    const { whatsappApiProvider } = await import("../providers/whatsapp-api-provider");

    await expect(
      whatsappApiProvider.sendText({ id: "ws-1" }, "5511999999999", "Oi"),
    ).rejects.toThrow("WAHA_API_URL/WAHA_BASE_URL/WAHA_URL not configured");
  });

  it("prefers the workspace session over default fallback in single-session mode", async () => {
    process.env.WAHA_API_URL = "https://waha.test";
    process.env.WAHA_SINGLE_SESSION = "true";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: "WORKING" }),
    });
    global.fetch = fetchMock as any;

    const { whatsappApiProvider } = await import("../providers/whatsapp-api-provider");
    const result = await whatsappApiProvider.getStatus("ws-1");

    expect(result.connected).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://waha.test/api/sessions/ws-1",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
});
