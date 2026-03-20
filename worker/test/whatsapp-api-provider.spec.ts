import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("whatsappApiProvider", () => {
  const originalEnv = {
    WAHA_API_URL: process.env.WAHA_API_URL,
    WAHA_BASE_URL: process.env.WAHA_BASE_URL,
    WAHA_URL: process.env.WAHA_URL,
    WAHA_SINGLE_SESSION: process.env.WAHA_SINGLE_SESSION,
    WAHA_SESSION_ID: process.env.WAHA_SESSION_ID,
    WAHA_NOWEB_STORE_ENABLED: process.env.WAHA_NOWEB_STORE_ENABLED,
    WAHA_NOWEB_STORE_FULL_SYNC: process.env.WAHA_NOWEB_STORE_FULL_SYNC,
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
    delete process.env.WAHA_NOWEB_STORE_ENABLED;
    delete process.env.WAHA_NOWEB_STORE_FULL_SYNC;
  });

  afterEach(() => {
    process.env.WAHA_API_URL = originalEnv.WAHA_API_URL;
    process.env.WAHA_BASE_URL = originalEnv.WAHA_BASE_URL;
    process.env.WAHA_URL = originalEnv.WAHA_URL;
    process.env.WAHA_SINGLE_SESSION = originalEnv.WAHA_SINGLE_SESSION;
    process.env.WAHA_SESSION_ID = originalEnv.WAHA_SESSION_ID;
    process.env.WAHA_NOWEB_STORE_ENABLED = originalEnv.WAHA_NOWEB_STORE_ENABLED;
    process.env.WAHA_NOWEB_STORE_FULL_SYNC = originalEnv.WAHA_NOWEB_STORE_FULL_SYNC;
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

  it("ignores a conflicting legacy connected boolean when WAHA reports DISCONNECTED", async () => {
    process.env.WAHA_API_URL = "https://waha.test";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          status: "DISCONNECTED",
          connected: true,
        }),
    });
    global.fetch = fetchMock as any;

    const { whatsappApiProvider } = await import("../providers/whatsapp-api-provider");
    const result = await whatsappApiProvider.getStatus("ws-1");

    expect(result.connected).toBe(false);
    expect(result.state).toBe("DISCONNECTED");
    expect(result.rawStatus).toBe("DISCONNECTED");
  });

  it("ensures NOWEB store aliases are applied when creating the session", async () => {
    process.env.WAHA_API_URL = "https://waha.test";
    process.env.WAHA_NOWEB_STORE_ENABLED = "true";
    process.env.WAHA_NOWEB_STORE_FULL_SYNC = "false";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({}),
      });
    global.fetch = fetchMock as any;

    const { whatsappApiProvider } = await import("../providers/whatsapp-api-provider");
    const result = await whatsappApiProvider.startSession("ws-1");

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://waha.test/api/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "ws-1",
          config: {
            webhooks: undefined,
            store: {
              enabled: true,
              fullSync: false,
              full_sync: false,
            },
            noweb: {
              store: {
                enabled: true,
                fullSync: false,
                full_sync: false,
              },
            },
          },
        }),
      }),
    );
  });
});
