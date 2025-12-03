import { providerStatus } from "./health-monitor";

/**
 * ==========================================================
 * UltraWA Provider — Modo Turbo
 * versão UWE-Ω + HealthMonitor PRO
 * ==========================================================
 */
export const ultrawaProvider = {
  name: "ultrawa",

  async sendText(workspace: any, to: string, message: string) {
    const apiKey = workspace?.ultrawa?.apiKey;

    if (!apiKey) {
      providerStatus.error("ultrawa");
      return { error: "ultrawa_key_missing" };
    }

    const url = "http://localhost:3005/sendText";
    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        body: JSON.stringify({ to, message, apiKey }),
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
        providerStatus.error("ultrawa");
      } else {
        providerStatus.success("ultrawa", latency);
      }

      console.log("📨 [UltraWA] →", json);
      return json;
    } catch (err: any) {
      providerStatus.error("ultrawa");
      return { error: String(err) };
    }
  },

  async sendMedia(workspace: any, to: string, type: string, url: string, caption?: string) {
    console.warn("[UltraWA] sendMedia fallback via texto com link.");
    const text = caption ? `${caption}\n${url}` : url;
    return this.sendText(workspace, to, text);
  },
};
