import { providerStatus } from "./health-monitor";

/**
 * ==========================================================
 * WAHA Provider (WhatsApp HTTP API)
 *
 * REST API para WAHA
 * Docs: https://waha.devlike.pro/docs/overview/introduction/
 * ==========================================================
 */

const WAHA_URL = (
  process.env.WAHA_API_URL ||
  process.env.WAHA_BASE_URL ||
  process.env.WAHA_URL ||
  "https://waha-plus-production-1172.up.railway.app"
).replace(/\/+$/, "");

const WAHA_KEY =
  process.env.WAHA_API_KEY ||
  process.env.WAHA_API_TOKEN ||
  "";

function buildUrl(path: string): string {
  return `${WAHA_URL}${path}`;
}

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (WAHA_KEY) {
    headers["X-Api-Key"] = WAHA_KEY;
  }
  return headers;
}

function toChatId(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (phone.includes("@")) return phone;
  return `${cleaned}@c.us`;
}

export const whatsappApiProvider = {
  name: "whatsapp-api",

  async sendText(workspace: any, to: string, message: string): Promise<any> {
    const sessionId = workspace.id;
    const chatId = toChatId(to);
    const url = buildUrl("/api/sendText");

    console.log(`📤 [WAHA] sendText | session=${sessionId} | to=${to}`);
    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ session: sessionId, chatId, text: message }),
      });

      const json: any = await res.json();
      const latency = Date.now() - started;

      if (!res.ok || json?.error) {
        providerStatus.error("whatsapp-api");
        console.error(`❌ [WAHA] Error:`, json);
        return { error: json?.error || json?.message || "send_failed" };
      }

      providerStatus.success("whatsapp-api", latency);
      const normalizedId = json?.id || json?.key?.id || null;
      console.log(`✅ [WAHA] Sent! id=${normalizedId} latency=${latency}ms`);

      return { success: true, id: normalizedId, provider: "waha", latency };
    } catch (err: any) {
      providerStatus.error("whatsapp-api");
      console.error(`❌ [WAHA] Fetch error:`, err.message);
      return { error: err.message || "network_error" };
    }
  },

  async sendMedia(
    workspace: any,
    to: string,
    type: "image" | "video" | "audio" | "document",
    mediaUrl: string,
    caption?: string,
  ): Promise<any> {
    const sessionId = workspace.id;
    const chatId = toChatId(to);

    // WAHA uses /api/sendFile for generic media, /api/sendImage for images
    const endpoint = type === "image" ? "/api/sendImage" : "/api/sendFile";
    const url = buildUrl(endpoint);

    console.log(`📤 [WAHA] sendMedia (${type}) | session=${sessionId} | to=${to}`);
    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          session: sessionId,
          chatId,
          file: { url: mediaUrl },
          caption: caption || "",
        }),
      });

      const json: any = await res.json();
      const latency = Date.now() - started;

      if (!res.ok || json?.error) {
        providerStatus.error("whatsapp-api");
        console.error(`❌ [WAHA] Media error:`, json);
        return { error: json?.error || json?.message || "send_media_failed" };
      }

      providerStatus.success("whatsapp-api", latency);
      const normalizedId = json?.id || json?.key?.id || null;
      console.log(`✅ [WAHA] Media sent! id=${normalizedId} latency=${latency}ms`);

      return { success: true, id: normalizedId, provider: "waha", latency };
    } catch (err: any) {
      providerStatus.error("whatsapp-api");
      console.error(`❌ [WAHA] Media fetch error:`, err.message);
      return { error: err.message || "network_error" };
    }
  },

  async getStatus(workspaceId: string): Promise<any> {
    const url = buildUrl(`/api/sessions/${encodeURIComponent(workspaceId)}`);

    try {
      const res = await fetch(url, { method: "GET", headers: buildHeaders() });
      if (!res.ok) return { connected: false, state: "error" };

      const json: any = await res.json();
      const wahaStatus = json?.status || "UNKNOWN";
      const connected = wahaStatus === "WORKING" || wahaStatus === "CONNECTED";

      return { connected, state: wahaStatus, message: json?.message };
    } catch (err: any) {
      console.error(`❌ [WAHA] Status error:`, err.message);
      return { connected: false, state: "error", error: err.message };
    }
  },

  async startSession(workspaceId: string): Promise<any> {
    const url = buildUrl("/api/sessions/start");
    console.log(`🔄 [WAHA] Starting session ${workspaceId}`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ name: workspaceId }),
      });

      const json: any = await res.json().catch(() => ({}));
      if (!res.ok && !json?.name) {
        console.error(`❌ [WAHA] Start session error:`, json);
        return { success: false, error: json?.error || json?.message };
      }

      console.log(`✅ [WAHA] Session started:`, json?.name || workspaceId);
      return { success: true, ...json };
    } catch (err: any) {
      console.error(`❌ [WAHA] Start session fetch error:`, err.message);
      return { success: false, error: err.message };
    }
  },

  async getQrCode(workspaceId: string): Promise<any> {
    const url = buildUrl(`/api/${encodeURIComponent(workspaceId)}/auth/qr`);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { ...buildHeaders(), Accept: "image/png" },
      });

      if (!res.ok) return { qr: null, error: "qr_not_available" };

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("image")) {
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        return { qr: `data:image/png;base64,${base64}`, available: true };
      }

      const json: any = await res.json().catch(() => null);
      if (json?.value) return { qr: json.value, available: true };

      return { qr: null, error: "qr_not_available" };
    } catch (err: any) {
      console.error(`❌ [WAHA] QR error:`, err.message);
      return { qr: null, error: err.message };
    }
  },

  async terminateSession(workspaceId: string): Promise<any> {
    const url = buildUrl("/api/sessions/stop");
    console.log(`🔴 [WAHA] Terminating session ${workspaceId}`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ name: workspaceId }),
      });

      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: json?.error || json?.message };

      return { success: true, ...json };
    } catch (err: any) {
      console.error(`❌ [WAHA] Terminate error:`, err.message);
      return { success: false, error: err.message };
    }
  },

  async isRegisteredUser(workspaceId: string, phone: string): Promise<boolean> {
    const chatId = toChatId(phone);
    const url = buildUrl(`/api/contacts/check-exists?session=${encodeURIComponent(workspaceId)}&phone=${encodeURIComponent(chatId)}`);

    try {
      const res = await fetch(url, { method: "GET", headers: buildHeaders() });
      if (!res.ok) return false;
      const json: any = await res.json();
      return json?.numberExists === true;
    } catch {
      return false;
    }
  },

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(buildUrl("/api/sessions"), {
        method: "GET",
        headers: buildHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
