/**
 * ARCHITECTURAL COHESION: WhatsApp Engine — the single provider-agnostic facade over multiple
 * WhatsApp providers. Covers message sending with anti-ban protection, session management,
 * message queueing, and media/video/voice/document/audio/sticker dispatch. All channel types
 * funnel through one routing surface; splitting by message type would duplicate the anti-ban,
 * session, and queue concerns across files.
 */

import { randomInt, randomUUID } from 'node:crypto';
import { autoProvider } from './auto-provider';
import { unifiedWhatsAppProvider } from './unified-whatsapp-provider';

import {
  assertProviderSendResult,
  errorMessage,
  errorStatus,
  isSameLockToken,
  resolveActionLockConfig,
  shouldBypassActionLock,
  sleep,
} from './whatsapp-engine.helpers';
import { redis } from '../redis-client';
import { AntiBan } from './anti-ban';
import { HealthMonitor } from './health-monitor';
import { PlanLimitsProvider } from './plan-limits';
import { getWhatsAppProviderFromEnv } from './whatsapp-provider-resolver';

type WorkspaceLike = {
  id: string;
  whatsappProvider?: string;
  [key: string]: unknown;
};

function normalizeWorkspace<T extends WorkspaceLike>(
  workspace: T,
): T & { whatsappProvider: string } {
  return {
    ...workspace,
    whatsappProvider: getWhatsAppProviderFromEnv(),
  };
}

function resolvePrimaryProvider(_workspace: WorkspaceLike) {
  void _workspace;
  return unifiedWhatsAppProvider;
}

async function releaseLockIfOwned(key: string, token: string): Promise<void> {
  const current = await redis.get(key).catch(() => null /* not found */);
  if (isSameLockToken(current, token)) {
    await redis.del(key).catch(() => undefined /* fire-and-forget: lock cleanup */);
  }
}

async function tryAcquireAndRun<T>(
  key: string,
  token: string,
  ttlMs: number,
  operation: () => Promise<T>,
): Promise<{ ran: true; value: T } | { ran: false }> {
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') {
    return { ran: false };
  }
  try {
    const value = await operation();
    return { ran: true, value };
  } finally {
    await releaseLockIfOwned(key, token);
  }
}

async function withWorkspaceActionLock<T>(
  workspaceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (shouldBypassActionLock()) {
    return operation();
  }

  const config = resolveActionLockConfig();
  const key = `whatsapp:action-lock:${workspaceId}`;
  const token = `${Date.now()}:${randomUUID()}`;
  const deadline = Date.now() + config.ttlMs;

  const attemptAcquire = async (): Promise<T> => {
    if (Date.now() >= deadline) {
      throw new Error(
        `Failed to acquire workspace action lock for ${workspaceId} within ${config.ttlMs}ms deadline`,
      );
    }
    const attempt = await tryAcquireAndRun(key, token, config.ttlMs, operation);
    if (attempt.ran) {
      return attempt.value;
    }
    await sleep(
      config.backoffMin + (config.backoffJitter > 0 ? randomInt(config.backoffJitter) : 0),
    );
    return attemptAcquire();
  };

  // Invariant I6: lock not acquired implies operation does NOT run.
  // Previously this fell through to `return operation()`, silently
  // executing unprotected sends and allowing duplicate WhatsApp
  // deliveries under contention. The BullMQ job retry mechanism handles
  // transient lock contention via job-level retries.
  return attemptAcquire();
}

/**
 * Runtime consolidado em Meta Cloud.
 * Mantém o nome histórico do engine para evitar ripple em filas/processadores.
 */
export const WhatsAppEngine = {
  async sendText(
    workspace: WorkspaceLike,
    to: string,
    message: string,
    options?: { quotedMessageId?: string | undefined; chatId?: string | undefined },
  ) {
    const normalizedWorkspace = normalizeWorkspace(workspace);
    return withWorkspaceActionLock(normalizedWorkspace.id, async () => {
      console.log(
        `\n[UWE-Ω] Enviando mensagem | workspace=${normalizedWorkspace.id} | provider=${normalizedWorkspace.whatsappProvider}`,
      );

      const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(normalizedWorkspace.id);
      if (!subStatus.active) {
        throw new Error(subStatus.reason || 'Assinatura inativa');
      }

      const dailyLimit = await PlanLimitsProvider.checkDailyMessageLimit(normalizedWorkspace.id);
      if (!dailyLimit.allowed) {
        throw new Error(dailyLimit.reason || 'Limite diário de mensagens excedido');
      }

      const msgLimit = await PlanLimitsProvider.checkMessageLimit(normalizedWorkspace.id);
      if (!msgLimit.allowed) {
        throw new Error(msgLimit.reason || 'Limite de mensagens excedido');
      }

      await AntiBan.apply(normalizedWorkspace);
      const jitter = 120 + randomInt(280);
      await sleep(jitter);

      try {
        const primaryProvider = resolvePrimaryProvider(normalizedWorkspace);
        const result = await primaryProvider.sendText(normalizedWorkspace, to, message, {
          quotedMessageId: options?.quotedMessageId,
          chatId: options?.chatId,
        });
        return assertProviderSendResult(result, 'text');
      } catch (error: unknown) {
        console.error(`[ERROR] [UWE-Ω] Error sending message: ${errorMessage(error)}`);

        const status = errorStatus(error);
        const messageText = errorMessage(error);
        const isRateLimit = status === 429 || messageText.includes('rate-limit');
        const isServerErr = typeof status === 'number' && status >= 500;

        if (isRateLimit) {
          console.warn(`[UWE-Ω] Rate Limit detected. Waiting 10s before retry...`);
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
        } catch (fallbackErr: unknown) {
          await HealthMonitor.pushAlert(normalizedWorkspace.id, 'fallback_failed', {
            provider: normalizedWorkspace.whatsappProvider,
            error: errorMessage(fallbackErr),
          });
          return {
            error: true,
            reason: errorMessage(fallbackErr) || messageText,
            status: 'FAILED_NO_RETRY',
          };
        }
      }
    });
  },

  async sendMedia(
    workspace: WorkspaceLike,
    to: string,
    type: 'image' | 'video' | 'audio' | 'document',
    url: string,
    caption?: string,
    options?: { quotedMessageId?: string | undefined; chatId?: string | undefined },
  ) {
    const normalizedWorkspace = normalizeWorkspace(workspace);
    return withWorkspaceActionLock(normalizedWorkspace.id, async () => {
      console.log(
        `\n[UWE-Ω] Enviando Mídia (${type}) | workspace=${normalizedWorkspace.id} | provider=${normalizedWorkspace.whatsappProvider}`,
      );

      const subStatus = await PlanLimitsProvider.checkSubscriptionStatus(normalizedWorkspace.id);
      if (!subStatus.active) {
        throw new Error(subStatus.reason || 'Assinatura inativa');
      }

      const dailyLimit = await PlanLimitsProvider.checkDailyMessageLimit(normalizedWorkspace.id);
      if (!dailyLimit.allowed) {
        throw new Error(dailyLimit.reason || 'Limite diário de mensagens excedido');
      }

      const msgLimit = await PlanLimitsProvider.checkMessageLimit(normalizedWorkspace.id);
      if (!msgLimit.allowed) {
        throw new Error(msgLimit.reason || 'Limite de mensagens excedido');
      }

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
      } catch (error: unknown) {
        console.error(`[ERROR] [UWE-Ω] Error sending media: ${errorMessage(error)}`);

        try {
          const fallback = await autoProvider.sendMedia(
            normalizedWorkspace,
            to,
            type,
            url,
            caption,
          );
          return assertProviderSendResult(fallback, 'media');
        } catch (fallbackErr: unknown) {
          await HealthMonitor.pushAlert(normalizedWorkspace.id, 'fallback_media_failed', {
            provider: normalizedWorkspace.whatsappProvider,
            error: errorMessage(fallbackErr),
          });
          throw fallbackErr;
        }
      }
    });
  },

  async sendTemplate(
    workspace: WorkspaceLike,
    to: string,
    name: string,
    language: string,
    components: Array<Record<string, unknown>> = [],
  ) {
    const normalizedWorkspace = normalizeWorkspace(workspace);
    const suffix = components?.length ? ` (${language}; ${components.length} componente(s))` : '';

    return this.sendText(normalizedWorkspace, to, `Template ${name}${suffix}`);
  },
};
