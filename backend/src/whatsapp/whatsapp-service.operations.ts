import { randomInt, randomUUID } from 'node:crypto';
import type { WsDeps, MessageDeliveryReceipt } from './whatsapp-service.types';
import { normalizeHashExt, normalizeJsonObjExt, isAutonomousEnabledExt, normalizeNumber, normalizeNumberExt } from './whatsapp-service.helpers';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue } from '../queue/queue';

export async function handleIncomingExt(
  deps: WsDeps & {
    isPlaceholderContact: (v: unknown, p?: string | null) => boolean;
    resolveTrustedName: (p: string, ...c: unknown[]) => string;
  },
  workspaceId: string,
  from: string,
  message: string,
) {
  const ws = await deps.workspaces.getWorkspace(workspaceId).catch(() => null);
  if (!ws) throw new Error('Workspace not found for incoming message');
  const dedupeKey = `incoming:dedupe:${workspaceId}:${from}:${normalizeHashExt(message)}`;
  const already = await deps.redis.get(dedupeKey);
  if (already) return { skipped: true, reason: 'duplicate' };
  await deps.redis.setex(dedupeKey, 60, '1');
  const lower = (message || '').toLowerCase();
  if (
    ['stop', 'sair', 'cancelar', 'cancel', 'parar', 'unsubscribe'].some((k) => lower.includes(k))
  ) {
    try {
      /* opt-out best effort - handled by service */
    } catch {
      /* handled by service */
    }
  }
  const saved = await deps.inbox.saveMessageByPhone({
    workspaceId,
    phone: from,
    content: message,
    direction: 'INBOUND',
  });
  const nPhone = normalizeNumber(from);
  const key = `reply:${nPhone}`;
  try {
    await deps.redis.rpush(key, message);
    await deps.redis.expire(key, 60 * 60 * 24);
  } catch {
    /* fallback handled */
  }
  await flowQueue.add(
    'resume-flow',
    { user: nPhone, message, workspaceId },
    { removeOnComplete: true },
  );
  try {
    const settings = normalizeJsonObjExt(ws.providerSettings);
    if (isAutonomousEnabledExt(settings) && saved?.contactId) {
      const scanKey = `autopilot:scan-contact:${workspaceId}:${saved.contactId}`;
      const reserved = await deps.redis.set(scanKey, saved.id, 'PX', deps.contactDebounceMs, 'NX');
      if (reserved === 'OK')
        await autopilotQueue.add(
          'scan-contact',
          {
            workspaceId,
            phone: from,
            contactId: saved.contactId,
            messageContent: message,
            messageId: saved.id,
          },
          {
            jobId: buildQueueJobId('scan-contact', workspaceId, saved.contactId, saved.id),
            delay: deps.contactDebounceMs,
            deduplication: {
              id: buildQueueDedupId('scan-contact', workspaceId, saved.contactId),
              ttl: deps.contactDebounceMs + 500,
            },
            removeOnComplete: true,
          },
        );
    }
    const apConfig = normalizeJsonObjExt(settings.autopilot);
    const hotFlowId = typeof apConfig.hotFlowId === 'string' ? apConfig.hotFlowId : null;
    if (
      hotFlowId &&
      ['preco', 'preço', 'price', 'quanto', 'pix', 'boleto', 'garantia', 'comprar', 'assinar'].some(
        (k) => lower.includes(k),
      )
    )
      await flowQueue.add('run-flow', {
        workspaceId,
        flowId: hotFlowId,
        user: nPhone,
        initialVars: { source: 'hot_signal', lastMessage: message },
      });
  } catch (err: unknown) {
    void deps.opsAlert?.alertOnCriticalError(err, 'WhatsappService.processInbound.autopilot', {
      workspaceId,
    });
  }
  if (saved?.contactId)
    void deps.neuroCrm.analyzeContact(workspaceId, saved.contactId).catch(() => {});
  try {
    await deps.redis.publish(
      `ws:copilot:${workspaceId}`,
      JSON.stringify({
        type: 'new_message',
        workspaceId,
        contactId: saved?.contactId,
        phone: from,
        message,
      }),
    );
  } catch {
    /* handled by service */
  }
  return { ok: true };
}

export async function sendDirectlyViaProviderExt(
  deps: Pick<WsDeps, 'prisma' | 'providerRegistry' | 'inbox' | 'redis'> & {
    normalizeChatId: (id: string) => string;
    readText: (v: unknown) => string;
    sleep: (ms: number) => Promise<void>;
    markChatAsReadBestEffort: (workspaceId: string, chatIdOrPhone: string) => Promise<void>;
  },
  workspaceId: string,
  to: string,
  message: string,
  opts?: {
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
    externalId?: string;
    complianceMode?: 'reactive' | 'proactive';
    forceDirect?: boolean;
    quotedMessageId?: string;
  },
) {
  const lockKey = `whatsapp:action-lock:${workspaceId}`;
  const token = `${Date.now()}:${randomUUID()}`;
  const ttlMs = Math.max(
    15_000,
    Number.parseInt(process.env.WHATSAPP_ACTION_LOCK_MS || '45000', 10) || 45_000,
  );
  const deadline = Date.now() + ttlMs;
  const tryAcquire = async (): Promise<MessageDeliveryReceipt> => {
    if (Date.now() >= deadline) {
      /* fall through */
    }
    const acquired = await deps.redis.set(lockKey, token, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      try {
        await deps.sleep(300 + randomInt(500));
        const nChatId = deps.normalizeChatId(to);
        await deps.markChatAsReadBestEffort(workspaceId, nChatId);
        await deps.providerRegistry.setPresence(workspaceId, 'available', nChatId).catch(() => {});
        await deps.sleep(300 + randomInt(500));
        await deps.providerRegistry.sendTyping(workspaceId, nChatId).catch(() => {});
        await deps.sleep(
          Math.max(
            500,
            Math.min(
              3500,
              450 + String(opts?.caption || message || '').trim().length * 35 + randomInt(450),
            ),
          ),
        );
        await deps.providerRegistry.stopTyping(workspaceId, nChatId).catch(() => {});
        const result = await deps.providerRegistry.sendMessage(workspaceId, to, message, {
          mediaUrl: opts?.mediaUrl,
          mediaType: opts?.mediaType,
          caption: opts?.caption,
          quotedMessageId: opts?.quotedMessageId,
        });
        if (!result.success) {
          await deps.providerRegistry.setPresence(workspaceId, 'offline', nChatId).catch(() => {});
          return { error: true, message: result.error || 'send_failed' };
        }
        await deps.markChatAsReadBestEffort(workspaceId, to);
        await deps.providerRegistry.setPresence(workspaceId, 'offline', nChatId).catch(() => {});
        await deps.inbox.saveMessageByPhone({
          workspaceId,
          phone: to,
          content: opts?.caption || message || opts?.mediaUrl || '',
          direction: 'OUTBOUND',
          externalId: result.messageId || opts?.externalId,
          type: opts?.mediaType ? opts.mediaType.toUpperCase() : 'TEXT',
          mediaUrl: opts?.mediaUrl,
          status: 'SENT',
        });
        return { ok: true, direct: true, delivery: 'sent', messageId: result.messageId };
      } finally {
        const current = await deps.redis.get(lockKey).catch(() => null);
        if (current === token) await deps.redis.del(lockKey).catch(() => {});
      }
    }
    await deps.sleep(250 + randomInt(250));
    return tryAcquire();
  };
  return tryAcquire();
}
