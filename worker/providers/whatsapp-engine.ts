import { autoProvider } from "./auto-provider";
import { whatsappApiProvider } from "./whatsapp-api-provider";

import { AntiBan } from "./anti-ban";
import { PlanLimitsProvider } from "./plan-limits";
import { HealthMonitor } from "./health-monitor";

function normalizeWorkspace(workspace: any) {
  return {
    ...workspace,
    whatsappProvider: "whatsapp-api",
  };
}

function assertProviderSendResult(result: any, channel: "text" | "media") {
  if (!result) {
    throw new Error(`WAHA ${channel} returned empty response`);
  }

  if (result?.error) {
    const reason =
      typeof result.error === "string"
        ? result.error
        : result.reason || result.message || `unknown_${channel}_error`;
    throw new Error(reason);
  }

  if (result?.success === false) {
    throw new Error(
      result?.reason || result?.message || `WAHA ${channel} send failed`,
    );
  }

  return result;
}

/**
 * Runtime consolidado em WAHA.
 * Mantém o nome histórico do engine para evitar ripple em filas/processadores.
 */
export const WhatsAppEngine = {
  async sendText(workspace: any, to: string, message: string) {
    const normalizedWorkspace = normalizeWorkspace(workspace);

    console.log(
      `\n⚡ [UWE-Ω] Enviando mensagem | workspace=${normalizedWorkspace.id} | provider=whatsapp-api`
    );

    const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(
      normalizedWorkspace.id,
    );
    if (!subStatus.active) {
      throw new Error(subStatus.reason || "Assinatura inativa");
    }

    const msgLimit = await PlanLimitsProvider.checkMessageLimit(
      normalizedWorkspace.id,
    );
    if (!msgLimit.allowed) {
      throw new Error(msgLimit.reason || "Limite de mensagens excedido");
    }

    await AntiBan.apply(normalizedWorkspace);
    const jitter = 120 + Math.floor(Math.random() * 280);
    await new Promise((r) => setTimeout(r, jitter));

    try {
      const result = await whatsappApiProvider.sendText(
        normalizedWorkspace,
        to,
        message,
      );
      return assertProviderSendResult(result, "text");
    } catch (error: any) {
      console.error(`❌ [UWE-Ω] Error sending message: ${error.message}`);

      const isRateLimit =
        error.response?.status === 429 || error.message?.includes("rate-limit");
      const isServerErr = error.response?.status >= 500;

      if (isRateLimit) {
        console.warn(
          `⏳ [UWE-Ω] Rate Limit detected. Waiting 10s before retry...`,
        );
        await new Promise((r) => setTimeout(r, 10000));
        await HealthMonitor.pushAlert(normalizedWorkspace.id, "rate_limit", {
          provider: "whatsapp-api",
        });
        throw error;
      }

      if (isServerErr) {
        await HealthMonitor.pushAlert(normalizedWorkspace.id, "provider_down", {
          provider: "whatsapp-api",
        });
        throw error;
      }

      try {
        const fallback = await autoProvider.sendText(
          normalizedWorkspace,
          to,
          message,
        );
        return assertProviderSendResult(fallback, "text");
      } catch (fallbackErr: any) {
        await HealthMonitor.pushAlert(
          normalizedWorkspace.id,
          "fallback_failed",
          {
            provider: "whatsapp-api",
            error: fallbackErr?.message,
          },
        );
        return {
          error: true,
          reason: fallbackErr?.message || error.message,
          status: "FAILED_NO_RETRY",
        };
      }
    }
  },

  async sendMedia(
    workspace: any,
    to: string,
    type: "image" | "video" | "audio" | "document",
    url: string,
    caption?: string,
  ) {
    const normalizedWorkspace = normalizeWorkspace(workspace);

    console.log(
      `\n⚡ [UWE-Ω] Enviando Mídia (${type}) | workspace=${normalizedWorkspace.id} | provider=whatsapp-api`,
    );

    await AntiBan.apply(normalizedWorkspace);

    try {
      const result = await whatsappApiProvider.sendMedia(
        normalizedWorkspace,
        to,
        type,
        url,
        caption,
      );
      return assertProviderSendResult(result, "media");
    } catch (error: any) {
      console.error(`❌ [UWE-Ω] Error sending media: ${error.message}`);

      try {
        const fallback = await autoProvider.sendMedia(
          normalizedWorkspace,
          to,
          type,
          url,
          caption,
        );
        return assertProviderSendResult(fallback, "media");
      } catch (fallbackErr: any) {
        await HealthMonitor.pushAlert(
          normalizedWorkspace.id,
          "fallback_media_failed",
          {
            provider: "whatsapp-api",
            error: fallbackErr?.message,
          },
        );
        throw fallbackErr;
      }
    }
  },

  async sendTemplate(
    workspace: any,
    to: string,
    name: string,
    language: string,
    components: any[] = [],
  ) {
    const normalizedWorkspace = normalizeWorkspace(workspace);
    const suffix = components?.length
      ? ` (${language}; ${components.length} componente(s))`
      : "";

    return this.sendText(
      normalizedWorkspace,
      to,
      `Template ${name}${suffix}`,
    );
  },
};
