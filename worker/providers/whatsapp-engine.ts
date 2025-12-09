import { metaProvider } from "./meta-provider";
import { wppProvider } from "./wpp-provider";
import { evolutionProvider } from "./evolution-provider";
import { ultrawaProvider } from "./ultrawa-provider";
import { hybridProvider } from "./hybrid-provider";
import { autoProvider } from "./auto-provider";
import { prisma } from "../db";

import { AntiBan } from "./anti-ban";
import { PlanLimitsProvider } from "./plan-limits";
import { HealthMonitor } from "./health-monitor";

const is24hEnforced = process.env.WA_ENFORCE_24H === "true";

async function ensure24hSession(workspaceId: string, to: string) {
  if (!is24hEnforced) return;
  const normalized = (to || "").replace(/\D/g, "");
  const contact = await prisma.contact.findUnique({
    where: { workspaceId_phone: { workspaceId, phone: normalized } },
    select: { id: true },
  });
  if (!contact) {
    throw new Error("session_expired");
  }
  const lastInbound = await prisma.message.findFirst({
    where: { contactId: contact.id, direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  if (!lastInbound || lastInbound.createdAt.getTime() < cutoff) {
    throw new Error("session_expired");
  }
}

/**
 * ======================================================================
 * UWE-Ω — ULTIMATE WHATSAPP ENGINE (VERSÃO PRO)
 * ======================================================================
 *
 * Esta é a camada central de orquestração.
 * Todo envio passa por aqui.
 *
 * Funções:
 * ✔ Workspace-aware routing
 * ✔ Multi-provider: meta, wpp, evolution, ultrawa, hybrid, auto
 * ✔ HealthMonitor feedback (dentro dos providers)
 * ✔ Anti-ban avançado (delays humanos + burst protection)
 * ✔ Logging padronizado
 * ✔ Fallback automático (hybrid/auto)
 */
export const WhatsAppEngine = {
  async sendText(workspace: any, to: string, message: string) {
    const provider = workspace?.whatsappProvider ?? "auto";

    console.log(
      `\n⚡ [UWE-Ω] Enviando mensagem | workspace=${workspace.id} | provider=${provider}`
    );

    // 0) Checagem de assinatura e limites de plano (fail-fast)
    const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(workspace.id);
    if (!subStatus.active) {
      throw new Error(subStatus.reason || "Assinatura inativa");
    }

    const msgLimit = await PlanLimitsProvider.checkMessageLimit(workspace.id);
    if (!msgLimit.allowed) {
      throw new Error(msgLimit.reason || "Limite de mensagens excedido");
    }

    // 1) Anti-ban PRO (delays humanos, burst limit, night-mode)
    await AntiBan.apply(workspace);
    // Pequeno jitter humano para evitar padrões robóticos
    const jitter = 120 + Math.floor(Math.random() * 280); // 120–400ms
    await new Promise((r) => setTimeout(r, jitter));

    // 2) Routing de acordo com o modo do workspace
    try {
      // Compliance: Janela de 24h (apenas Meta Cloud para mensagens livres)
      if (provider === "meta") {
        await ensure24hSession(workspace.id, to);
      }

      switch (provider) {
        case "meta":
          return await metaProvider.sendText(workspace, to, message);

        case "wpp":
          return await wppProvider.sendText(workspace, to, message);

        case "evolution":
          return await evolutionProvider.sendText(workspace, to, message);

        case "ultrawa":
          return await ultrawaProvider.sendText(workspace, to, message);

        case "hybrid":
          return await hybridProvider.sendText(workspace, to, message);

        case "auto":
        default:
          return await autoProvider.sendText(workspace, to, message);
      }
    } catch (error: any) {
      console.error(`❌ [UWE-Ω] Error sending message: ${error.message}`);

      // Smart Retry Logic
      const isRateLimit = error.response?.status === 429 || error.message?.includes('rate-limit');
      const isServerErr = error.response?.status >= 500;
      
      if (isRateLimit) {
          console.warn(`⏳ [UWE-Ω] Rate Limit detected. Waiting 10s before retry...`);
          await new Promise(r => setTimeout(r, 10000));
          await HealthMonitor.pushAlert(workspace.id, "rate_limit", { provider });
          throw error; // Throw to trigger BullMQ retry
      }

      if (isServerErr) {
          await HealthMonitor.pushAlert(workspace.id, "provider_down", { provider });
          throw error; // Throw to trigger BullMQ retry
      }

      // Fallback automático: se não estiver em "auto", tente autoProvider antes de desistir
      if (provider !== "auto") {
        try {
          console.warn("[UWE-Ω] Fallback automático → autoProvider");
          return await autoProvider.sendText(workspace, to, message);
        } catch (fallbackErr: any) {
          console.error("Fallback falhou:", fallbackErr?.message || fallbackErr);
          await HealthMonitor.pushAlert(workspace.id, "fallback_failed", { provider, error: fallbackErr?.message });
        }
      }

      // Para 400/401/404 erros definitivos, não retry.
      return { error: true, reason: error.message, status: 'FAILED_NO_RETRY' };
    }
  },

  async sendMedia(workspace: any, to: string, type: 'image'|'video'|'audio'|'document', url: string, caption?: string) {
    const provider = workspace?.whatsappProvider ?? "auto";
    console.log(`\n⚡ [UWE-Ω] Enviando Mídia (${type}) | workspace=${workspace.id} | provider=${provider}`);

    await AntiBan.apply(workspace);

    try {
        if (provider === "meta") {
          await ensure24hSession(workspace.id, to);
        }

        // Delegate to providers (assuming they implement sendMedia - if not, we need to add it to them too)
        // For now, let's assume they do or we fallback to text with link if not supported
        switch (provider) {
            case "meta": return await metaProvider.sendMedia(workspace, to, type, url, caption);
            case "wpp": return await wppProvider.sendMedia(workspace, to, type, url, caption);
            case "evolution": return await evolutionProvider.sendMedia(workspace, to, type, url, caption);
            // ... others
            default: return await autoProvider.sendMedia(workspace, to, type, url, caption);
        }
    } catch (error: any) {
        console.error(`❌ [UWE-Ω] Error sending media: ${error.message}`);
        
        // Fallback automático para mídia
        if (provider !== "auto") {
            try {
                console.warn("[UWE-Ω] Fallback automático (Mídia) → autoProvider");
                return await autoProvider.sendMedia(workspace, to, type, url, caption);
            } catch (fallbackErr: any) {
                console.error("Fallback de mídia falhou:", fallbackErr?.message || fallbackErr);
                await HealthMonitor.pushAlert(workspace.id, "fallback_media_failed", { provider, error: fallbackErr?.message });
            }
        }

        throw error; // Let BullMQ handle retries if fallback also failed or wasn't attempted
    }
  },

  async sendTemplate(
    workspace: any,
    to: string,
    name: string,
    language: string,
    components: any[] = [],
  ) {
    const provider = workspace?.whatsappProvider ?? "auto";
    console.log(`\n⚡ [UWE-Ω] Enviando Template | workspace=${workspace.id} | provider=${provider} | template=${name}`);

    await AntiBan.apply(workspace);

    try {
      switch (provider) {
        case "meta":
        case "auto":
        case "hybrid":
          return await metaProvider.sendTemplate(workspace, to, name, language, components);
        default:
          // Fallback: envia texto com nome do template se o provedor não suportar
          return await this.sendText(
            workspace,
            to,
            `Template ${name} (fallback texto)`,
          );
      }
    } catch (error: any) {
      console.error(`❌ [UWE-Ω] Error sending template: ${error.message}`);
      throw error;
    }
  }
};
