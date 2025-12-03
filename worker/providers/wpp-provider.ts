import { providerStatus } from "./health-monitor";

/**
 * ==========================================================
 * WPPConnect Provider — WhatsApp Web
 * versão UWE-Ω + HealthMonitor PRO
 * ==========================================================
 */
export const wppProvider = {
  name: "wpp",

  async sendText(workspace: any, to: string, message: string) {
    const sessionId = workspace?.wpp?.sessionId;

    if (!sessionId) {
      providerStatus.error("wpp");
      return { error: "wpp_session_missing" };
    }

    const baseUrl = process.env.WPP_API_URL || "http://localhost:21465";
    const url = `${baseUrl}/message/${sessionId}/sendText`;

    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        body: JSON.stringify({ phone: to, message }),
        headers: { "Content-Type": "application/json" },
      });

      const json: any = await res.json();
      const normalizedId =
        json?.id ||
        json?.messageId ||
        json?.message?.id ||
        json?.response?.id ||
        null;
      if (normalizedId) {
        json.id = normalizedId;
      }
      const latency = Date.now() - started;

      if (json?.error) {
        providerStatus.error("wpp");
      } else {
        providerStatus.success("wpp", latency);
      }

      console.log("📨 [WPP] →", json);
      return json;
    } catch (err: any) {
      providerStatus.error("wpp");
      return { error: String(err) };
    }
  },

  async sendMedia(workspace: any, to: string, type: string, url: string, caption?: string) {
    const sessionId = workspace?.wpp?.sessionId;
    if (!sessionId) {
      providerStatus.error("wpp");
      return { error: "wpp_session_missing" };
    }

    // Tenta endpoint de mídia; se falhar, recua para texto com link
    try {
      const baseUrl = process.env.WPP_API_URL || "http://localhost:21465";
      const apiUrl = `${baseUrl}/message/${sessionId}/sendFile`;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: to,
          path: url,
          type,
          caption,
        }),
      });

      if (!res.ok) {
        const msg = caption ? `${caption}\n${url}` : url;
        return this.sendText(workspace, to, msg);
      }

      const json: any = await res.json();
      providerStatus.success("wpp", 200);
      return json;
    } catch (err: any) {
      providerStatus.error("wpp");
      const msg = caption ? `${caption}\n${url}` : url;
      return this.sendText(workspace, to, msg);
    }
  }
};
