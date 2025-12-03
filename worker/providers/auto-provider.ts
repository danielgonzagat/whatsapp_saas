import { providerStatus } from "./health-monitor";
import { metaProvider } from "./meta-provider";
import { wppProvider } from "./wpp-provider";
import { evolutionProvider } from "./evolution-provider";
import { ultrawaProvider } from "./ultrawa-provider";

/**
 * ==========================================================
 * AUTO PROVIDER — AI Routing (UWE-Ω)
 * Escolhe o provedor mais saudável em TEMPO REAL.
 * ==========================================================
 */
export const autoProvider = {
  name: "auto",

  async sendText(workspace: any, to: string, message: string) {
    console.log(`🤖 [AUTO] Selecionando melhor provedor (workspace=${workspace.id})`);

    const ranking = providerStatus.getHealthRanking();

    for (const prov of ranking) {
      console.log(`➡ Testando provedor: ${prov}`);

      try {
        switch (prov) {
          case "meta":
            return await metaProvider.sendText(workspace, to, message);
          case "wpp":
            return await wppProvider.sendText(workspace, to, message);
          case "evolution":
            return await evolutionProvider.sendText(workspace, to, message);
          case "ultrawa":
            return await ultrawaProvider.sendText(workspace, to, message);
        }
      } catch {
        providerStatus.error(prov);
        console.log(`⚠ Falhou: ${prov}`);
      }
    }

    console.error("❌ NENHUM PROVEDOR DISPONÍVEL");
    return { error: "all_providers_failed" };
  },

  async sendMedia(workspace: any, to: string, type: string, url: string, caption?: string) {
    console.log(`🤖 [AUTO] Selecionando melhor provedor para Mídia (workspace=${workspace.id})`);

    const ranking = providerStatus.getHealthRanking();

    for (const prov of ranking) {
      try {
        switch (prov) {
          case "meta":
             // Meta uses strong typing in implementation but TS here is loose
             // @ts-ignore 
            return await metaProvider.sendMedia(workspace, to, type, url, caption);
          case "wpp":
            return await wppProvider.sendMedia(workspace, to, type, url, caption);
          case "evolution":
            return await evolutionProvider.sendMedia(workspace, to, type, url, caption);
          case "ultrawa":
            // return await ultrawaProvider.sendMedia(workspace, to, type, url, caption);
            console.warn("Ultrawa sendMedia not implemented yet");
            break;
        }
      } catch (err) {
        providerStatus.error(prov);
        console.log(`⚠ Falhou Envio de Mídia (${prov}):`, err);
      }
    }

    return { error: "all_providers_failed_media" };
  },

  async sendTemplate(
    workspace: any,
    to: string,
    name: string,
    language: string,
    components: any[],
  ) {
    // Prioriza Meta para template; fallback texto
    const res = await metaProvider.sendTemplate(workspace, to, name, language, components);
    if (res?.error) {
      return await this.sendText(workspace, to, `Template ${name} (fallback texto)`);
    }
    return res;
  }
};
