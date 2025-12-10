import { providerStatus } from "./health-monitor";

/**
 * ==========================================================
 * WhatsApp-API Provider (chrishubert/whatsapp-api)
 * 
 * REST API wrapper para o container whatsapp-api
 * Documentação: https://github.com/chrishubert/whatsapp-api
 * ==========================================================
 */

// No docker, o serviço expõe a porta interna 3000; fora do docker use 3004 via env
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "http://whatsapp-api:3000";
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY || "kloel-whatsapp-api-key";

function buildUrl(path: string): string {
  return `${WHATSAPP_API_URL}${path}`;
}

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (WHATSAPP_API_KEY) {
    headers["x-api-key"] = WHATSAPP_API_KEY;
  }
  return headers;
}

/**
 * Converte telefone para chatId formato WhatsApp
 * Exemplo: 5511999998888 → 5511999998888@c.us
 */
function toChatId(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  // Se já tiver @c.us ou @g.us, retorna como está
  if (phone.includes("@")) return phone;
  return `${cleaned}@c.us`;
}

export const whatsappApiProvider = {
  name: "whatsapp-api",

  /**
   * Envia mensagem de texto
   */
  async sendText(workspace: any, to: string, message: string): Promise<any> {
    const sessionId = workspace.id; // Usamos workspaceId como sessionId
    const chatId = toChatId(to);
    const url = buildUrl(`/client/sendMessage/${sessionId}`);

    console.log(`📤 [WHATSAPP-API] sendText | session=${sessionId} | to=${to}`);

    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          chatId,
          contentType: "string",
          content: message,
        }),
      });

      const json: any = await res.json();
      const latency = Date.now() - started;

      if (!res.ok || json?.error) {
        providerStatus.error("whatsapp-api");
        console.error(`❌ [WHATSAPP-API] Error:`, json);
        return { error: json?.error || json?.message || "send_failed" };
      }

      providerStatus.success("whatsapp-api", latency);

      // Normalizar ID da mensagem
      const normalizedId =
        json?.id?._serialized ||
        json?.id ||
        json?.messageId ||
        null;

      console.log(`✅ [WHATSAPP-API] Sent! id=${normalizedId} latency=${latency}ms`);

      return {
        success: true,
        id: normalizedId,
        provider: "whatsapp-api",
        latency,
      };
    } catch (err: any) {
      providerStatus.error("whatsapp-api");
      console.error(`❌ [WHATSAPP-API] Fetch error:`, err.message);
      return { error: err.message || "network_error" };
    }
  },

  /**
   * Envia mídia (imagem, vídeo, áudio, documento)
   */
  async sendMedia(
    workspace: any,
    to: string,
    type: "image" | "video" | "audio" | "document",
    mediaUrl: string,
    caption?: string
  ): Promise<any> {
    const sessionId = workspace.id;
    const chatId = toChatId(to);
    const url = buildUrl(`/client/sendMessage/${sessionId}`);

    console.log(`📤 [WHATSAPP-API] sendMedia (${type}) | session=${sessionId} | to=${to}`);

    const started = Date.now();

    // Mapear tipo para contentType da API
    const contentTypeMap: Record<string, string> = {
      image: "MessageMediaFromURL",
      video: "MessageMediaFromURL",
      audio: "MessageMediaFromURL",
      document: "MessageMediaFromURL",
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          chatId,
          contentType: contentTypeMap[type] || "MessageMediaFromURL",
          content: mediaUrl,
          options: {
            caption: caption || "",
            sendAudioAsVoice: type === "audio",
          },
        }),
      });

      const json: any = await res.json();
      const latency = Date.now() - started;

      if (!res.ok || json?.error) {
        providerStatus.error("whatsapp-api");
        console.error(`❌ [WHATSAPP-API] Media error:`, json);
        return { error: json?.error || json?.message || "send_media_failed" };
      }

      providerStatus.success("whatsapp-api", latency);

      const normalizedId =
        json?.id?._serialized ||
        json?.id ||
        json?.messageId ||
        null;

      console.log(`✅ [WHATSAPP-API] Media sent! id=${normalizedId} latency=${latency}ms`);

      return {
        success: true,
        id: normalizedId,
        provider: "whatsapp-api",
        latency,
      };
    } catch (err: any) {
      providerStatus.error("whatsapp-api");
      console.error(`❌ [WHATSAPP-API] Media fetch error:`, err.message);
      return { error: err.message || "network_error" };
    }
  },

  /**
   * Verifica status da sessão
   */
  async getStatus(workspaceId: string): Promise<any> {
    const url = buildUrl(`/session/status/${workspaceId}`);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: buildHeaders(),
      });

      if (!res.ok) {
        return { connected: false, state: "error" };
      }

      const json: any = await res.json();
      return {
        connected: json?.state === "CONNECTED",
        state: json?.state || "unknown",
        message: json?.message,
      };
    } catch (err: any) {
      console.error(`❌ [WHATSAPP-API] Status error:`, err.message);
      return { connected: false, state: "error", error: err.message };
    }
  },

  /**
   * Inicia uma nova sessão
   */
  async startSession(workspaceId: string): Promise<any> {
    const url = buildUrl(`/session/start/${workspaceId}`);

    console.log(`🔄 [WHATSAPP-API] Starting session ${workspaceId}`);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: buildHeaders(),
      });

      const json: any = await res.json();

      if (!res.ok) {
        console.error(`❌ [WHATSAPP-API] Start session error:`, json);
        return { success: false, error: json?.error || json?.message };
      }

      console.log(`✅ [WHATSAPP-API] Session started:`, json);
      return { success: true, ...json };
    } catch (err: any) {
      console.error(`❌ [WHATSAPP-API] Start session fetch error:`, err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Obtém QR Code para autenticação
   */
  async getQrCode(workspaceId: string): Promise<any> {
    const url = buildUrl(`/session/qr/${workspaceId}/image`);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: buildHeaders(),
      });

      if (!res.ok) {
        return { qr: null, error: "qr_not_available" };
      }

      // A API retorna a imagem diretamente
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType = res.headers.get("content-type") || "image/png";

      return { 
        qr: `data:${mimeType};base64,${base64}`,
        available: true,
      };
    } catch (err: any) {
      console.error(`❌ [WHATSAPP-API] QR error:`, err.message);
      return { qr: null, error: err.message };
    }
  },

  /**
   * Encerra sessão
   */
  async terminateSession(workspaceId: string): Promise<any> {
    const url = buildUrl(`/session/terminate/${workspaceId}`);

    console.log(`🔴 [WHATSAPP-API] Terminating session ${workspaceId}`);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: buildHeaders(),
      });

      const json: any = await res.json();

      if (!res.ok) {
        return { success: false, error: json?.error || json?.message };
      }

      return { success: true, ...json };
    } catch (err: any) {
      console.error(`❌ [WHATSAPP-API] Terminate error:`, err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Verifica se usuário está registrado no WhatsApp
   */
  async isRegisteredUser(workspaceId: string, phone: string): Promise<boolean> {
    const chatId = toChatId(phone);
    const url = buildUrl(`/client/isRegisteredUser/${workspaceId}`);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ number: chatId }),
      });

      if (!res.ok) return false;

      const json: any = await res.json();
      return json?.result === true;
    } catch {
      return false;
    }
  },

  /**
   * Health check - ping na API
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(buildUrl("/ping"), {
        method: "GET",
        headers: buildHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
