import { providerStatus } from "./health-monitor";
import { RateLimiter } from "./rate-limiter";

/**
 * ==========================================================
 * META PROVIDER — WhatsApp Cloud API (OFICIAL)
 * versão UWE-Ω + HealthMonitor PRO
 * ==========================================================
 */
export const metaProvider = {
  name: "meta",

  async sendText(workspace: any, to: string, message: string) {
    // 1. Check Rate Limit
    const canSend = await RateLimiter.checkLimit(workspace.id);
    if (!canSend) {
      console.warn(`[META] Rate Limit Exceeded for Workspace ${workspace.id}`);
      throw new Error("RATE_LIMIT_EXCEEDED"); // BullMQ will retry
    }

    const token = workspace?.meta?.token;
    const phoneId = workspace?.meta?.phoneId;

    if (!token || !phoneId) {
      providerStatus.error("meta");
      return { error: "meta_credentials_missing" };
    }

    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    };

    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json: any = await res.json();
      const latency = Date.now() - started;

      if (json?.error) {
        providerStatus.error("meta");
      } else {
        providerStatus.success("meta", latency);
      }

      console.log("📨 [META] →", json);
      return json;
    } catch (err: any) {
      providerStatus.error("meta");
      return { error: String(err) };
    }
  },

  async sendMedia(workspace: any, to: string, type: 'image'|'video'|'audio'|'document', url: string, caption?: string) {
    // 1. Check Rate Limit
    const canSend = await RateLimiter.checkLimit(workspace.id);
    if (!canSend) {
      console.warn(`[META] Rate Limit Exceeded for Workspace ${workspace.id}`);
      throw new Error("RATE_LIMIT_EXCEEDED"); 
    }

    const token = workspace?.meta?.token;
    const phoneId = workspace?.meta?.phoneId;

    if (!token || !phoneId) return { error: "meta_credentials_missing" };

    const apiUrl = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const payload: any = {
      messaging_product: "whatsapp",
      to,
      type: type,
    };

    // Meta API structure: { image: { link: "..." } }
    payload[type] = { link: url };
    if (caption && type !== 'audio') payload[type].caption = caption;

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      console.log(`📨 [META] Media (${type}) →`, json);
      return json;
    } catch (err) {
      console.error("❌ [META] Media Error:", err);
      throw err;
    }
  },

  async sendTemplate(
    workspace: any,
    to: string,
    name: string,
    language: string,
    components: any[] = [],
  ) {
    const token = workspace?.meta?.token;
    const phoneId = workspace?.meta?.phoneId;

    if (!token || !phoneId) {
      providerStatus.error("meta");
      return { error: "meta_credentials_missing" };
    }

    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: language || "en_US" },
        components: components || [],
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json: any = await res.json();
      if (json?.error) {
        providerStatus.error("meta");
      } else {
        providerStatus.success("meta");
      }
      return json;
    } catch (err: any) {
      providerStatus.error("meta");
      return { error: String(err) };
    }
  }
};
