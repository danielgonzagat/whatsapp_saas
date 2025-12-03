import { metaProvider } from "./meta-provider";
import { wppProvider } from "./wpp-provider";
import { providerStatus } from "./health-monitor";

/**
 * ==========================================================
 * HYBRID PROVIDER — Meta (principal) + WPP (fallback)
 * versão UWE-Ω + HealthMonitor PRO
 * ==========================================================
 */

export const hybridProvider = {
  name: "hybrid",

  async sendText(workspace: any, to: string, message: string) {
    console.log(`🔀 [HYBRID] tent → META`);

    // PRIMEIRA TENTATIVA: META API
    const primary = await metaProvider.sendText(workspace, to, message);

    if (primary?.error) {
      providerStatus.error("meta");
      console.log("⚠ META falhou → fallback para WPP");
      return wppProvider.sendText(workspace, to, message);
    }

    // sucesso no META
    providerStatus.success("meta", 200);
    return primary;
  },

  async sendMedia(workspace: any, to: string, type: string, url: string, caption?: string) {
    console.log(`🔀 [HYBRID] mídia → META`);
    const primary = await metaProvider.sendMedia(workspace, to, type as any, url, caption);

    if ((primary as any)?.error) {
      providerStatus.error("meta");
      console.log("⚠ META falhou (mídia) → fallback para WPP");
      return wppProvider.sendMedia(workspace, to, type as any, url, caption);
    }

    providerStatus.success("meta", 200);
    return primary;
  },
};
