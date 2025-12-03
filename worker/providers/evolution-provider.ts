import { providerStatus } from "./health-monitor";

/**
 * ==========================================================
 * EvolutionAPI Provider — WhatsApp Web Engine
 * versão UWE-Ω + HealthMonitor PRO
 * ==========================================================
 */
export const evolutionProvider = {
  name: "evolution",

  async sendText(workspace: any, to: string, message: string) {
    const apiKey = workspace?.evolution?.apiKey;

    if (!apiKey) {
      providerStatus.error("evolution");
      return { error: "evolution_key_missing" };
    }

    const baseUrl = process.env.EVOLUTION_API_URL || "http://localhost:8080";
    const url = `${baseUrl}/sendMessage`;
    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        body: JSON.stringify({
          number: to,
          message,
          apiKey,
        }),
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
        providerStatus.error("evolution");
      } else {
        providerStatus.success("evolution", latency);
      }

      console.log("📨 [Evolution] →", json);
      return json;
    } catch (err: any) {
      providerStatus.error("evolution");
      return { error: String(err) };
    }
  },

  async sendMedia(workspace: any, to: string, type: string, url: string, caption?: string) {
    const apiKey = workspace?.evolution?.apiKey;
    if (!apiKey) {
      providerStatus.error("evolution");
      return { error: "evolution_key_missing" };
    }

    // Se a API de mídia não estiver disponível, faz fallback para link
    const text = caption ? `${caption}\n${url}` : url;
    return this.sendText(workspace, to, text);
  }
};
