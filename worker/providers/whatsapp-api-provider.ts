import { providerStatus } from "./health-monitor";

/**
 * ==========================================================
 * WAHA Provider (worker runtime)
 *
 * Alinhado ao backend:
 * - mesma resolução de sessionId
 * - API granular do WAHA quando disponível
 * - fallback para endpoints legados
 * - typing manual antes de enviar texto
 * ==========================================================
 */

function getWahaUrl(): string {
  const configured =
    process.env.WAHA_API_URL ||
    process.env.WAHA_BASE_URL ||
    process.env.WAHA_URL ||
    "";
  const normalized = configured.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("WAHA_API_URL/WAHA_BASE_URL/WAHA_URL not configured");
  }

  return normalized;
}

function getWahaKey(): string {
  return (
    process.env.WAHA_API_KEY ||
    process.env.WAHA_API_TOKEN ||
    ""
  ).trim();
}

const SESSION_OVERRIDE = (process.env.WAHA_SESSION_ID || "").trim();
const EXPLICIT_WORKSPACE_MODE =
  process.env.WAHA_MULTISESSION === "true" ||
  process.env.WAHA_USE_WORKSPACE_SESSION === "true";
const EXPLICIT_SINGLE_SESSION_MODE =
  process.env.WAHA_SINGLE_SESSION === "true" ||
  process.env.WAHA_MULTISESSION === "false" ||
  process.env.WAHA_USE_WORKSPACE_SESSION === "false";

const USE_WORKSPACE_SESSIONS =
  !SESSION_OVERRIDE &&
  (EXPLICIT_WORKSPACE_MODE || !EXPLICIT_SINGLE_SESSION_MODE);

const TYPING_ENABLED = process.env.WAHA_TYPING_ENABLED !== "false";

function buildUrl(path: string): string {
  return `${getWahaUrl()}${path}`;
}

function buildHeaders(overrides?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...overrides,
  };

  const apiKey = getWahaKey();
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }

  return headers;
}

function resolveSessionId(workspaceOrId: any): string {
  if (SESSION_OVERRIDE) {
    return SESSION_OVERRIDE;
  }

  if (USE_WORKSPACE_SESSIONS) {
    if (typeof workspaceOrId === "string" && workspaceOrId.trim()) {
      return workspaceOrId.trim();
    }

    const workspaceId = workspaceOrId?.id || workspaceOrId?.workspaceId;
    if (workspaceId) {
      return String(workspaceId);
    }
  }

  return "default";
}

function toChatId(phone: string): string {
  const cleaned = String(phone || "").replace(/\D/g, "");
  if (String(phone || "").includes("@")) return String(phone);
  return `${cleaned}@c.us`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJson(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function rawRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: any,
  options?: { headers?: Record<string, string> },
): Promise<Response> {
  const response = await fetch(buildUrl(path), {
    method,
    headers: buildHeaders({
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers || {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
  });

  return response;
}

async function requestJson(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: any,
  options?: { headers?: Record<string, string> },
): Promise<any> {
  const res = await rawRequest(method, path, body, options);
  const data = await parseJson(res);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `${method} ${path} failed`);
  }

  return data;
}

async function tryRequestJson(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: any,
  options?: { headers?: Record<string, string> },
): Promise<any | null> {
  try {
    const res = await rawRequest(method, path, body, options);
    if (!res.ok) return null;
    return await parseJson(res);
  } catch {
    return null;
  }
}

function isAlreadyExistsMessage(message: string): boolean {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("already") ||
    normalized.includes("exist") ||
    normalized.includes("duplicate")
  );
}

function buildSessionConfig() {
  const webhookUrl =
    process.env.WHATSAPP_HOOK_URL ||
    process.env.WAHA_HOOK_URL ||
    "";
  const events =
    process.env.WHATSAPP_HOOK_EVENTS ||
    process.env.WAHA_HOOK_EVENTS ||
    "";
  const webhookSecret =
    process.env.WHATSAPP_API_WEBHOOK_SECRET ||
    process.env.WAHA_WEBHOOK_SECRET ||
    "";

  const webhooks =
    webhookUrl && events
      ? [
          {
            url: webhookUrl,
            events: events
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            hmac: process.env.WHATSAPP_HOOK_HMAC_KEY
              ? { key: process.env.WHATSAPP_HOOK_HMAC_KEY }
              : undefined,
            customHeaders: webhookSecret
              ? [{ name: "X-Api-Key", value: webhookSecret }]
              : undefined,
          },
        ]
      : undefined;

  const storeEnabled = process.env.WAHA_STORE_ENABLED !== "false";

  return {
    webhooks,
    store: {
      enabled: storeEnabled,
      fullSync: true,
    },
  };
}

async function ensureSessionConfigured(sessionId: string): Promise<void> {
  const config = buildSessionConfig();
  const path = `/api/sessions/${encodeURIComponent(sessionId)}`;

  for (const payload of [{ config }, config]) {
    try {
      await requestJson("PUT", path, payload);
      return;
    } catch (error: any) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("404") || message.includes("not found")) {
        return;
      }
    }
  }

  console.warn(
    `⚠️ [WAHA] Failed to update config for session ${sessionId}. Webhooks/store may be stale.`,
  );
}

async function ensureSessionExists(sessionId: string): Promise<void> {
  const existing = await tryRequestJson(
    "GET",
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (existing) {
    await ensureSessionConfigured(sessionId);
    return;
  }

  try {
    await requestJson("POST", "/api/sessions", {
      name: sessionId,
      config: buildSessionConfig(),
    });
    await ensureSessionConfigured(sessionId);
  } catch (error: any) {
    if (!isAlreadyExistsMessage(error?.message || "")) {
      throw error;
    }
    await ensureSessionConfigured(sessionId);
  }
}

async function startTyping(sessionId: string, chatId: string): Promise<void> {
  const payload = { session: sessionId, chatId };
  const direct = await tryRequestJson("POST", "/api/startTyping", payload);
  if (direct) return;

  await requestJson(
    "POST",
    `/api/${encodeURIComponent(sessionId)}/presence`,
    {
      chatId,
      presence: "typing",
    },
  ).catch(() => undefined);
}

async function stopTyping(sessionId: string, chatId: string): Promise<void> {
  const payload = { session: sessionId, chatId };
  const direct = await tryRequestJson("POST", "/api/stopTyping", payload);
  if (direct) return;

  await requestJson(
    "POST",
    `/api/${encodeURIComponent(sessionId)}/presence`,
    {
      chatId,
      presence: "paused",
    },
  ).catch(() => undefined);
}

async function simulateTyping(
  sessionId: string,
  chatId: string,
  message: string,
): Promise<() => Promise<void>> {
  if (!TYPING_ENABLED) {
    return async () => undefined;
  }

  await startTyping(sessionId, chatId).catch(() => undefined);
  const duration = Math.max(
    400,
    Math.min(2500, 350 + String(message || "").length * 35),
  );
  await sleep(duration);
  return async () => {
    await stopTyping(sessionId, chatId).catch(() => undefined);
  };
}

export const whatsappApiProvider = {
  name: "whatsapp-api",

  async sendText(workspace: any, to: string, message: string): Promise<any> {
    const sessionId = resolveSessionId(workspace);
    const chatId = toChatId(to);

    console.log(`📤 [WAHA] sendText | session=${sessionId} | to=${to}`);
    const started = Date.now();
    const stopTypingFn = await simulateTyping(sessionId, chatId, message);

    try {
      const json = await requestJson("POST", "/api/sendText", {
        session: sessionId,
        chatId,
        text: message,
      });

      const latency = Date.now() - started;
      providerStatus.success("whatsapp-api", latency);
      const normalizedId =
        json?.id ||
        json?.key?.id ||
        json?.key?._serialized ||
        null;

      console.log(`✅ [WAHA] Sent! id=${normalizedId} latency=${latency}ms`);
      return { success: true, id: normalizedId, provider: "waha", latency };
    } catch (err: any) {
      providerStatus.error("whatsapp-api");
      console.error(`❌ [WAHA] Fetch error:`, err.message);
      throw new Error(err.message || "network_error");
    } finally {
      await stopTypingFn();
    }
  },

  async sendMedia(
    workspace: any,
    to: string,
    type: "image" | "video" | "audio" | "document",
    mediaUrl: string,
    caption?: string,
  ): Promise<any> {
    const sessionId = resolveSessionId(workspace);
    const chatId = toChatId(to);
    const endpoint = type === "image" ? "/api/sendImage" : "/api/sendFile";

    console.log(`📤 [WAHA] sendMedia (${type}) | session=${sessionId} | to=${to}`);
    const started = Date.now();

    try {
      const json = await requestJson("POST", endpoint, {
        session: sessionId,
        chatId,
        file: { url: mediaUrl },
        caption: caption || "",
      });

      const latency = Date.now() - started;
      providerStatus.success("whatsapp-api", latency);
      const normalizedId =
        json?.id ||
        json?.key?.id ||
        json?.key?._serialized ||
        null;

      console.log(`✅ [WAHA] Media sent! id=${normalizedId} latency=${latency}ms`);
      return { success: true, id: normalizedId, provider: "waha", latency };
    } catch (err: any) {
      providerStatus.error("whatsapp-api");
      console.error(`❌ [WAHA] Media fetch error:`, err.message);
      throw new Error(err.message || "network_error");
    }
  },

  async getStatus(workspaceId: string): Promise<any> {
    const sessionId = resolveSessionId(workspaceId);

    try {
      const json = await requestJson(
        "GET",
        `/api/sessions/${encodeURIComponent(sessionId)}`,
      );
      const rawStatus = json?.status || json?.engine?.state || "UNKNOWN";
      const connected = rawStatus === "WORKING" || rawStatus === "CONNECTED";

      return {
        connected,
        state: rawStatus,
        message: json?.message,
        phoneNumber:
          json?.me?.id ||
          json?.me?.phone ||
          json?.phone ||
          json?.phoneNumber ||
          null,
        pushName:
          json?.me?.pushName ||
          json?.me?.name ||
          json?.pushName ||
          json?.name ||
          null,
      };
    } catch (err: any) {
      console.error(`❌ [WAHA] Status error:`, err.message);
      return { connected: false, state: "error", error: err.message };
    }
  },

  async startSession(workspaceId: string): Promise<any> {
    const sessionId = resolveSessionId(workspaceId);
    console.log(`🔄 [WAHA] Starting session ${sessionId}`);

    try {
      await ensureSessionExists(sessionId);

      const granular = await tryRequestJson(
        "POST",
        `/api/sessions/${encodeURIComponent(sessionId)}/start`,
      );

      if (!granular) {
        await requestJson("POST", "/api/sessions/start", { name: sessionId });
      }

      console.log(`✅ [WAHA] Session started:`, sessionId);
      return { success: true, name: sessionId };
    } catch (err: any) {
      const message = String(err?.message || "").toLowerCase();
      if (
        message.includes("already") ||
        message.includes("exist") ||
        message.includes("session_starting")
      ) {
        return { success: true, name: sessionId, message: "session_exists" };
      }

      console.error(`❌ [WAHA] Start session fetch error:`, err.message);
      return { success: false, error: err.message };
    }
  },

  async getQrCode(workspaceId: string): Promise<any> {
    const sessionId = resolveSessionId(workspaceId);

    try {
      const direct =
        (await rawRequest(
          "POST",
          `/api/${encodeURIComponent(sessionId)}/auth/qr`,
          undefined,
          { headers: { Accept: "image/png, application/json" } },
        ).catch(() => null)) ||
        (await rawRequest(
          "GET",
          `/api/${encodeURIComponent(sessionId)}/auth/qr`,
          undefined,
          { headers: { Accept: "image/png, application/json" } },
        ).catch(() => null));

      if (!direct || !direct.ok) {
        return { qr: null, error: "qr_not_available" };
      }

      const contentType = direct.headers.get("content-type") || "";
      if (contentType.includes("image")) {
        const buffer = await direct.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        return { qr: `data:image/png;base64,${base64}`, available: true };
      }

      const json = await parseJson(direct);
      if (json?.value) return { qr: json.value, available: true };
      if (json?.qr) return { qr: json.qr, available: true };

      return { qr: null, error: "qr_not_available" };
    } catch (err: any) {
      console.error(`❌ [WAHA] QR error:`, err.message);
      return { qr: null, error: err.message };
    }
  },

  async terminateSession(workspaceId: string): Promise<any> {
    const sessionId = resolveSessionId(workspaceId);
    console.log(`🔴 [WAHA] Terminating session ${sessionId}`);

    try {
      const granular = await tryRequestJson(
        "POST",
        `/api/sessions/${encodeURIComponent(sessionId)}/stop`,
      );

      if (!granular) {
        await requestJson("POST", "/api/sessions/stop", { name: sessionId });
      }

      return { success: true };
    } catch (err: any) {
      console.error(`❌ [WAHA] Terminate error:`, err.message);
      return { success: false, error: err.message };
    }
  },

  async logoutSession(workspaceId: string): Promise<any> {
    const sessionId = resolveSessionId(workspaceId);

    try {
      await requestJson("POST", "/api/sessions/logout", { name: sessionId });
      return { success: true };
    } catch (err: any) {
      try {
        await requestJson("POST", "/api/sessions/stop", {
          name: sessionId,
          logout: true,
        });
        return { success: true };
      } catch (fallbackErr: any) {
        return {
          success: false,
          error: fallbackErr?.message || err?.message || "logout_failed",
        };
      }
    }
  },

  async isRegisteredUser(workspaceId: string, phone: string): Promise<boolean> {
    const sessionId = resolveSessionId(workspaceId);
    const chatId = toChatId(phone);
    const path =
      `/api/contacts/check-exists?session=${encodeURIComponent(sessionId)}` +
      `&phone=${encodeURIComponent(chatId)}`;

    try {
      const json = await requestJson("GET", path);
      return json?.numberExists === true;
    } catch {
      return false;
    }
  },

  async ping(): Promise<boolean> {
    try {
      const res = await rawRequest("GET", "/api/sessions");
      return res.ok;
    } catch {
      return false;
    }
  },
};
