import { providerStatus } from './health-monitor';
import { unifiedWhatsAppProvider } from './unified-whatsapp-provider';
import { getWhatsAppProviderFromEnv } from './whatsapp-provider-resolver';

/**
 * Runtime consolidado: o nome do provider vem de WHATSAPP_PROVIDER_DEFAULT
 * (ADR 0001 §D7). O antigo "auto" agora normaliza para o provider oficial.
 */
export const autoProvider = {
  name: 'auto',

  async sendText(workspace: any, to: string, message: string) {
    const providerName = getWhatsAppProviderFromEnv();
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
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      providerStatus.error(providerName);
      return { error: errorInstanceofError?.message || 'meta_send_failed' };
    }
  },

  async sendMedia(workspace: any, to: string, type: string, url: string, caption?: string) {
    const providerName = getWhatsAppProviderFromEnv();
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
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      providerStatus.error(providerName);
      return { error: errorInstanceofError?.message || 'meta_media_failed' };
    }
  },

  async sendTemplate(
    workspace: any,
    to: string,
    name: string,
    language: string,
    components: unknown[],
  ) {
    const suffix = components?.length ? ` (${language}; ${components.length} componente(s))` : '';
    return this.sendText(workspace, to, `Template ${name}${suffix}`);
  },
};
