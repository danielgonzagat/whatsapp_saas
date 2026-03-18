import { providerStatus } from "./health-monitor";
import { whatsappApiProvider } from "./whatsapp-api-provider";

/**
 * Runtime consolidado em WAHA.
 * O antigo "auto" agora apenas normaliza para o provider oficial.
 */
export const autoProvider = {
  name: "auto",

  async sendText(workspace: any, to: string, message: string) {
    try {
      const result = await whatsappApiProvider.sendText(
        {
          ...workspace,
          whatsappProvider: "whatsapp-api",
        },
        to,
        message,
      );
      if (result?.error) {
        providerStatus.error("whatsapp-api");
      }
      return result;
    } catch (error: any) {
      providerStatus.error("whatsapp-api");
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
    try {
      const result = await whatsappApiProvider.sendMedia(
        {
          ...workspace,
          whatsappProvider: "whatsapp-api",
        },
        to,
        type as any,
        url,
        caption,
      );
      if (result?.error) {
        providerStatus.error("whatsapp-api");
      }
      return result;
    } catch (error: any) {
      providerStatus.error("whatsapp-api");
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
