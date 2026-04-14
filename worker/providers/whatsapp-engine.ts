import { autoProvider } from './auto-provider';
import { unifiedWhatsAppProvider } from './unified-whatsapp-provider';

import { redis } from '../redis-client';
import { AntiBan } from './anti-ban';
import { HealthMonitor } from './health-monitor';
import { PlanLimitsProvider } from './plan-limits';
import { getWhatsAppProviderFromEnv } from './whatsapp-provider-resolver';

function normalizeWorkspace(workspace: any) {
  return {
    ...workspace,
    whatsappProvider: getWhatsAppProviderFromEnv(),
  };
}

function resolvePrimaryProvider(workspace: any) {
  return unifiedWhatsAppProvider;
}

function assertProviderSendResult(result: any, channel: 'text' | 'media') {
  if (!result) {
    throw new Error(`Meta ${channel} returned empty response`);
  }

  if (result?.error) {
    const reason =
      typeof result.error === 'string'
        ? result.error
        : result.reason || result.message || `unknown_${channel}_error`;
    throw new Error(reason);
  }

  if (result?.success === false) {
    throw new Error(result?.reason || result?.message || `Meta ${channel} send failed`);
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withWorkspaceActionLock<T>(
  workspaceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const testEnforce = process.env.WHATSAPP_ACTION_LOCK_TEST_ENFORCE === 'true';
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  if (isTestEnv && !testEnforce) {
    return operation();
  }

  const key = `whatsapp:action-lock:${workspaceId}`;
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  // Production minimum: 15s. Test mode: allow shorter values so the
  // lock-deadline test path runs quickly.
  const ttlMs = Math.max(
    isTestEnv ? 100 : 15_000,
    Number.parseInt(process.env.WHATSAPP_ACTION_LOCK_MS || '45000', 10) || 45_000,
  );
  const deadline = Date.now() + ttlMs;
  // Keep production backoff at 250-500ms. Shorter in test mode only.
  const backoffMin = isTestEnv ? 50 : 250;
  const backoffJitter = isTestEnv ? 50 : 250;

  while (Date.now() < deadline) {
    const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      try {
        return await operation();
      } finally {
        const current = await redis.get(key).catch(() => null /* not found */);
        if (current === token) {
          await redis.del(key).catch(() => undefined /* fire-and-forget: lock cleanup */);
        }
      }
    }

    await sleep(backoffMin + Math.floor(Math.random() * backoffJitter));
  }

  // Invariant I6: lock not acquired implies operation does NOT run.
  // Previously this fell through to `return operation()`, silently
  // executing unprotected sends and allowing duplicate WhatsApp
  // deliveries under contention. The BullMQ job retry mechanism handles
  // transient lock contention via job-level retries.
  throw new Error(
    `Failed to acquire workspace action lock for ${workspaceId} within ${ttlMs}ms deadline`,
  );
}

/**
 * Runtime consolidado em Meta Cloud.
 * Mantém o nome histórico do engine para evitar ripple em filas/processadores.
 */
export const WhatsAppEngine = {
  async sendText(
    workspace: any,
    to: string,
    message: string,
    options?: { quotedMessageId?: string; chatId?: string },
  ) {
    const normalizedWorkspace = normalizeWorkspace(workspace);
    return withWorkspaceActionLock(normalizedWorkspace.id, async () => {
      console.log(
        `\n⚡ [UWE-Ω] Enviando mensagem | workspace=${normalizedWorkspace.id} | provider=${normalizedWorkspace.whatsappProvider}`,
      );

      const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(normalizedWorkspace.id);
      if (!subStatus.active) {
        throw new Error(subStatus.reason || 'Assinatura inativa');
      }

      const msgLimit = await PlanLimitsProvider.checkMessageLimit(normalizedWorkspace.id);
      if (!msgLimit.allowed) {
        throw new Error(msgLimit.reason || 'Limite de mensagens excedido');
      }

      await AntiBan.apply(normalizedWorkspace);
      const jitter = 120 + Math.floor(Math.random() * 280);
      await sleep(jitter);

      try {
        const primaryProvider = resolvePrimaryProvider(normalizedWorkspace);
        const result = await primaryProvider.sendText(normalizedWorkspace, to, message, {
          quotedMessageId: options?.quotedMessageId,
          chatId: options?.chatId,
        });
        return assertProviderSendResult(result, 'text');
      } catch (error: any) {
        console.error(`❌ [UWE-Ω] Error sending message: ${error.message}`);

        const isRateLimit = error.response?.status === 429 || error.message?.includes('rate-limit');
        const isServerErr = error.response?.status >= 500;

        if (isRateLimit) {
          console.warn(`⏳ [UWE-Ω] Rate Limit detected. Waiting 10s before retry...`);
          await sleep(10000);
          await HealthMonitor.pushAlert(normalizedWorkspace.id, 'rate_limit', {
            provider: normalizedWorkspace.whatsappProvider,
          });
          throw error;
        }

        if (isServerErr) {
          await HealthMonitor.pushAlert(normalizedWorkspace.id, 'provider_down', {
            provider: normalizedWorkspace.whatsappProvider,
          });
          throw error;
        }

        try {
          const fallback = await autoProvider.sendText(normalizedWorkspace, to, message);
          return assertProviderSendResult(fallback, 'text');
        } catch (fallbackErr: any) {
          await HealthMonitor.pushAlert(normalizedWorkspace.id, 'fallback_failed', {
            provider: normalizedWorkspace.whatsappProvider,
            error: fallbackErr?.message,
          });
          return {
            error: true,
            reason: fallbackErr?.message || error.message,
            status: 'FAILED_NO_RETRY',
          };
        }
      }
    });
  },

  async sendMedia(
    workspace: any,
    to: string,
    type: 'image' | 'video' | 'audio' | 'document',
    url: string,
    caption?: string,
    options?: { quotedMessageId?: string; chatId?: string },
  ) {
    const normalizedWorkspace = normalizeWorkspace(workspace);
    return withWorkspaceActionLock(normalizedWorkspace.id, async () => {
      console.log(
        `\n⚡ [UWE-Ω] Enviando Mídia (${type}) | workspace=${normalizedWorkspace.id} | provider=${normalizedWorkspace.whatsappProvider}`,
      );

      await AntiBan.apply(normalizedWorkspace);

      try {
        const primaryProvider = resolvePrimaryProvider(normalizedWorkspace);
        const result = await primaryProvider.sendMedia(
          normalizedWorkspace,
          to,
          type,
          url,
          caption,
          {
            quotedMessageId: options?.quotedMessageId,
            chatId: options?.chatId,
          },
        );
        return assertProviderSendResult(result, 'media');
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
          return assertProviderSendResult(fallback, 'media');
        } catch (fallbackErr: any) {
          await HealthMonitor.pushAlert(normalizedWorkspace.id, 'fallback_media_failed', {
            provider: normalizedWorkspace.whatsappProvider,
            error: fallbackErr?.message,
          });
          throw fallbackErr;
        }
      }
    });
  },

  async sendTemplate(
    workspace: any,
    to: string,
    name: string,
    language: string,
    components: any[] = [],
  ) {
    const normalizedWorkspace = normalizeWorkspace(workspace);
    const suffix = components?.length ? ` (${language}; ${components.length} componente(s))` : '';

    return this.sendText(normalizedWorkspace, to, `Template ${name}${suffix}`);
  },
};
