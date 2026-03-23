import { providerStatus } from "./health-monitor";
import { unifiedWhatsAppProvider } from "./unified-whatsapp-provider";

/**
 * Runtime consolidado em WAHA.
 * O antigo "auto" agora apenas normaliza para o provider oficial.
 */
export const autoProvider = {
  name: "auto",

  async sendText(workspace: any, to: string, message: string) {
    const providerName =
      String(workspace?.whatsappProvider || "").trim() === "whatsapp-web-agent"
        ? "whatsapp-web-agent"
        : "whatsapp-api";
    try {
      const result = await unifiedWhatsAppProvider.sendText(
        {
          ...workspace,
          whatsappProvider: providerName,
        },
        to,
        message,
      );
      if (result?.error) {
        providerStatus.error(providerName);
      }
      return result;
    } catch (error: any) {
      providerStatus.error(providerName);
      return { error: error?.message || "waha_send_failed" };
    }
  },

  async sendMedia(
    workspace: any,
    to: string,
    type: string,
    url: string,
    caption?: string,
  ) {
    const providerName =
      String(workspace?.whatsappProvider || "").trim() === "whatsapp-web-agent"
        ? "whatsapp-web-agent"
        : "whatsapp-api";
    try {
      const result = await unifiedWhatsAppProvider.sendMedia(
        {
          ...workspace,
          whatsappProvider: providerName,
        },
        to,
        type as any,
        url,
        caption,
      );
      if (result?.error) {
        providerStatus.error(providerName);
      }
      return result;
    } catch (error: any) {
      providerStatus.error(providerName);
      return { error: error?.message || "waha_media_failed" };
    }
  },

  async sendTemplate(
    workspace: any,
    to: string,
    name: string,
    language: string,
    components: any[],
  ) {
    const suffix = components?.length
      ? ` (${language}; ${components.length} componente(s))`
      : "";
    return this.sendText(
      workspace,
      to,
      `Template ${name}${suffix}`,
    );
  },
};
