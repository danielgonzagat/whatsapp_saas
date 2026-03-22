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
const TEST_RUNTIME =
  process.env.NODE_ENV === "test" || process.env.VITEST === "true";

function readBooleanEnv(keys: string[], defaultValue: boolean): boolean {
  for (const key of keys) {
    const rawValue = process.env[key];
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      continue;
    }

    const normalized = rawValue.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return defaultValue;
}

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

function extractWorkspaceSessionId(workspaceOrId: any): string {
  if (typeof workspaceOrId === "string" && workspaceOrId.trim()) {
    return workspaceOrId.trim();
  }

  const explicitSessionName =
    workspaceOrId?.providerSettings?.whatsappApiSession?.sessionName ||
    workspaceOrId?.whatsappApiSession?.sessionName ||
    workspaceOrId?.sessionName;

  if (typeof explicitSessionName === "string" && explicitSessionName.trim()) {
    return explicitSessionName.trim();
  }

  const workspaceId = workspaceOrId?.id || workspaceOrId?.workspaceId;
  return workspaceId ? String(workspaceId).trim() : "";
}

function resolveSessionId(workspaceOrId: any): string {
  const workspaceSessionId = extractWorkspaceSessionId(workspaceOrId);

  if (
    workspaceSessionId &&
    workspaceSessionId.toLowerCase() !== "default"
  ) {
    return workspaceSessionId;
  }

  if (SESSION_OVERRIDE && SESSION_OVERRIDE.toLowerCase() !== "default") {
    return SESSION_OVERRIDE;
  }

  if (USE_WORKSPACE_SESSIONS && workspaceSessionId) {
    return workspaceSessionId;
  }

  if (workspaceSessionId) {
    return workspaceSessionId;
  }

  if (SESSION_OVERRIDE) {
    return SESSION_OVERRIDE;
  }

  return "default";
}

function toChatId(phone: string): string {
  const cleaned = String(phone || "").replace(/\D/g, "");
  if (String(phone || "").includes("@")) return String(phone);
  return `${cleaned}@c.us`;
}

function extractChatsPayload(payload: any): any[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.chats)) {
    return payload.chats;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

function extractMessagesPayload(payload: any): any[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.messages)) {
    return payload.messages;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

function extractLidMappingsPayload(payload: any): Array<{ lid: string; pn: string }> {
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return candidates
    .map((entry: any) => ({
      lid: String(entry?.lid || "").trim(),
      pn: String(entry?.pn || "").trim(),
    }))
    .filter((entry) => Boolean(entry.lid) && Boolean(entry.pn));
}

async function collectPagedPayload(
  pathBuilder: (offset: number, limit: number) => string,
  extractor: (payload: any) => any[],
  options?: {
    pageSize?: number;
    maxPages?: number;
    keyFn?: (row: any) => string;
  },
): Promise<any[]> {
  const pageSize = Math.max(1, Math.min(200, options?.pageSize || 200));
  const maxPages = Math.max(1, Math.min(20, options?.maxPages || 10));
  const collected: any[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const payload = await tryRequestJson("GET", pathBuilder(offset, pageSize));
    if (!payload) {
      break;
    }

    const rows = extractor(payload);
    if (!rows.length) {
      break;
    }

    let added = 0;
    for (const row of rows) {
      const key =
        options?.keyFn?.(row) ||
        String(row?.id || row?.chatId || row?.lid || JSON.stringify(row));
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      collected.push(row);
      added += 1;
    }

    if (rows.length < pageSize || added === 0) {
      break;
    }
  }

  return collected;
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

function normalizeRawSessionStatus(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const normalized = raw.trim().toUpperCase();
  return normalized || null;
}

function mapRawSessionStatus(
  rawStatus: string | null,
): "CONNECTED" | "DISCONNECTED" | "STARTING" | "SCAN_QR_CODE" | "FAILED" | null {
  switch (rawStatus) {
    case "WORKING":
    case "CONNECTED":
      return "CONNECTED";
    case "SCAN_QR_CODE":
    case "QR":
    case "QRCODE":
      return "SCAN_QR_CODE";
    case "STARTING":
    case "OPENING":
      return "STARTING";
    case "FAILED":
      return "FAILED";
    case "STOPPED":
    case "DISCONNECTED":
    case "LOGGED_OUT":
      return "DISCONNECTED";
    default:
      return null;
  }
}

function resolveSessionState(data: any): {
  rawStatus: string;
  state: "CONNECTED" | "DISCONNECTED" | "STARTING" | "SCAN_QR_CODE" | "FAILED";
} {
  const rawCandidates = [
    data?.engine?.state,
    data?.state,
    data?.session?.state,
    data?.status,
    data?.session?.status,
  ]
    .map((value) => normalizeRawSessionStatus(value))
    .filter((value): value is string => Boolean(value));

  const uniqueCandidates = Array.from(new Set(rawCandidates));
  const priority = [
    "CONNECTED",
    "SCAN_QR_CODE",
    "STARTING",
    "FAILED",
    "DISCONNECTED",
  ] as const;

  for (const desiredState of priority) {
    const matched = uniqueCandidates.find(
      (candidate) => mapRawSessionStatus(candidate) === desiredState,
    );
    if (matched) {
      return { rawStatus: matched, state: desiredState };
    }
  }

  return {
    rawStatus: uniqueCandidates[0] || "UNKNOWN",
    state: "DISCONNECTED",
  };
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
  const storeEnabled = readBooleanEnv(
    ["WAHA_NOWEB_STORE_ENABLED", "WAHA_STORE_ENABLED"],
    true,
  );
  const storeFullSync = readBooleanEnv(
    ["WAHA_NOWEB_STORE_FULL_SYNC", "WAHA_STORE_FULL_SYNC"],
    true,
  );
  const storeConfig = {
    enabled: storeEnabled,
    fullSync: storeFullSync,
    full_sync: storeFullSync,
  };

  return {
    webhooks,
    store: storeConfig,
    noweb: {
      store: storeConfig,
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
  const createPayload = {
    name: sessionId,
    config: buildSessionConfig(),
  };

  try {
    await requestJson("POST", "/api/sessions", createPayload);
    await ensureSessionConfigured(sessionId);
    return;
  } catch (error: any) {
    if (isAlreadyExistsMessage(error?.message || "")) {
      await ensureSessionConfigured(sessionId);
      return;
    }
  }

  try {
    await requestJson("POST", "/api/sessions/start", { name: sessionId });
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

async function sendSeen(sessionId: string, chatId: string): Promise<void> {
  await requestJson("POST", "/api/sendSeen", {
    session: sessionId,
    chatId,
  }).catch(() => undefined);
}

async function readChatMessages(sessionId: string, chatId: string): Promise<void> {
  const scoped = await tryRequestJson(
    "POST",
    `/api/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chatId)}/messages/read`,
  );

  if (scoped) {
    return;
  }

  await sendSeen(sessionId, chatId).catch(() => undefined);
}

async function setPresence(
  sessionId: string,
  presence: "available" | "offline" | "typing" | "paused",
  chatId?: string,
): Promise<void> {
  const payload: Record<string, any> = { presence };
  if (chatId) {
    payload.chatId = chatId;
  }

  await requestJson(
    "POST",
    `/api/${encodeURIComponent(sessionId)}/presence`,
    payload,
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

  async sendText(
    workspace: any,
    to: string,
    message: string,
    options?: { quotedMessageId?: string; chatId?: string },
  ): Promise<any> {
    const sessionId = resolveSessionId(workspace);
    const chatId = toChatId(options?.chatId || to);

    console.log(`📤 [WAHA] sendText | session=${sessionId} | to=${to}`);
    const started = Date.now();
    const stopTypingFn = TEST_RUNTIME
      ? async () => undefined
      : await (async () => {
          await readChatMessages(sessionId, chatId).catch(() => undefined);
          await setPresence(sessionId, "available", chatId).catch(() => undefined);
          return simulateTyping(sessionId, chatId, message);
        })();

    try {
      const payload: Record<string, any> = {
        session: sessionId,
        chatId,
        text: message,
      };
      if (options?.quotedMessageId) {
        payload.reply_to = options.quotedMessageId;
      }

      const json = await requestJson("POST", "/api/sendText", payload);

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
      if (!TEST_RUNTIME) {
        await readChatMessages(sessionId, chatId).catch(() => undefined);
        await setPresence(sessionId, "offline", chatId).catch(() => undefined);
      }
    }
  },

  async sendMedia(
    workspace: any,
    to: string,
    type: "image" | "video" | "audio" | "document",
    mediaUrl: string,
    caption?: string,
    options?: { quotedMessageId?: string; chatId?: string },
  ): Promise<any> {
    const sessionId = resolveSessionId(workspace);
    const chatId = toChatId(options?.chatId || to);
    const endpoint = type === "image" ? "/api/sendImage" : "/api/sendFile";

    console.log(`📤 [WAHA] sendMedia (${type}) | session=${sessionId} | to=${to}`);
    const started = Date.now();
    if (!TEST_RUNTIME) {
      await readChatMessages(sessionId, chatId).catch(() => undefined);
      await setPresence(sessionId, "available", chatId).catch(() => undefined);
    }

    try {
      const payload: Record<string, any> = {
        session: sessionId,
        chatId,
        file: { url: mediaUrl },
        caption: caption || "",
      };
      if (options?.quotedMessageId) {
        payload.reply_to = options.quotedMessageId;
      }

      const json = await requestJson("POST", endpoint, payload);

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
    } finally {
      if (!TEST_RUNTIME) {
        await readChatMessages(sessionId, chatId).catch(() => undefined);
        await setPresence(sessionId, "offline", chatId).catch(() => undefined);
      }
    }
  },

  async getChats(workspaceId: string): Promise<any[]> {
    const sessionId = resolveSessionId(workspaceId);
    const overview = await collectPagedPayload(
      (offset, limit) =>
        `/api/${encodeURIComponent(sessionId)}/chats/overview?limit=${limit}&offset=${offset}`,
      extractChatsPayload,
      {
        pageSize: 200,
        maxPages: 10,
        keyFn: (row) => String(row?.id || row?.chatId || ""),
      },
    );
    if (overview.length) {
      return overview;
    }

    const scoped = await collectPagedPayload(
      (offset, limit) =>
        `/api/${encodeURIComponent(sessionId)}/chats?limit=${limit}&offset=${offset}`,
      extractChatsPayload,
      {
        pageSize: 200,
        maxPages: 10,
        keyFn: (row) => String(row?.id || row?.chatId || ""),
      },
    );
    if (scoped.length) {
      return scoped;
    }

    const fallback = await requestJson(
      "GET",
      `/api/${encodeURIComponent(sessionId)}/chats`,
    );
    return extractChatsPayload(fallback);
  },

  async getLidMappings(workspaceId: string): Promise<Array<{ lid: string; pn: string }>> {
    const sessionId = resolveSessionId(workspaceId);
    return collectPagedPayload(
      (offset, limit) =>
        `/api/${encodeURIComponent(sessionId)}/lids?limit=${limit}&offset=${offset}`,
      extractLidMappingsPayload,
      {
        pageSize: 200,
        maxPages: 20,
        keyFn: (row) => String(row?.lid || ""),
      },
    );
  },

  async getChatMessages(
    workspaceId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<any[]> {
    const sessionId = resolveSessionId(workspaceId);
    const normalizedChatId = toChatId(chatId);
    const limit = Math.max(1, Math.min(100, options?.limit || 50));
    const offset = Math.max(0, options?.offset || 0);
    const downloadMedia = options?.downloadMedia === true ? "true" : "false";

    const scoped = await tryRequestJson(
      "GET",
      `/api/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(normalizedChatId)}/messages?limit=${limit}&offset=${offset}&downloadMedia=${downloadMedia}`,
    );
    if (scoped) {
      return extractMessagesPayload(scoped);
    }

    const fallback = await requestJson(
      "GET",
      `/api/messages?session=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(normalizedChatId)}&limit=${limit}&offset=${offset}&downloadMedia=${downloadMedia}`,
    );
    return extractMessagesPayload(fallback);
  },

  async upsertContactProfile(
    workspaceId: string,
    input: { phone: string; name?: string | null },
  ): Promise<boolean> {
    const sessionId = resolveSessionId(workspaceId);
    const chatId = toChatId(input.phone);
    const fullName = String(input.name || "").trim();

    if (!chatId || !fullName) {
      return false;
    }

    const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
    const lastName = rest.join(" ").trim();
    const scopedPayload = {
      firstName: firstName || fullName,
      lastName: lastName || undefined,
      fullName,
      name: fullName,
    };
    const genericPayload = {
      session: sessionId,
      chatId,
      ...scopedPayload,
    };

    const attempts = [
      () =>
        tryRequestJson(
          "PUT",
          `/api/${encodeURIComponent(sessionId)}/contacts/${encodeURIComponent(chatId)}`,
          scopedPayload,
        ),
      () =>
        tryRequestJson(
          "POST",
          `/api/${encodeURIComponent(sessionId)}/contacts/${encodeURIComponent(chatId)}`,
          scopedPayload,
        ),
      () => tryRequestJson("POST", "/api/contacts", genericPayload),
    ];

    for (const attempt of attempts) {
      const result = await attempt();
      if (result) {
        return true;
      }
    }

    return false;
  },

  async readChatMessages(workspaceId: string, chatId: string): Promise<void> {
    const sessionId = resolveSessionId(workspaceId);
    await readChatMessages(sessionId, toChatId(chatId));
  },

  async getStatus(workspaceId: string): Promise<any> {
    const sessionId = resolveSessionId(workspaceId);

    try {
      const json = await requestJson(
        "GET",
        `/api/sessions/${encodeURIComponent(sessionId)}`,
      );
      const resolvedStatus = resolveSessionState(json);
      const connected = resolvedStatus.state === "CONNECTED";

      return {
        connected,
        state: resolvedStatus.state,
        rawStatus: resolvedStatus.rawStatus,
        message: json?.message || resolvedStatus.rawStatus,
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
