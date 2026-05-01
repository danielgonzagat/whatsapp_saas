import { randomInt } from 'node:crypto';
import { prisma } from '../db';
import { extractExternalId } from '../flow-engine-external-id';
import { ProviderRegistry } from '../providers/registry';
import { redisPub } from '../redis-client';
import type { WorkerLogger as WorkerLoggerClass } from '../logger';

export interface FlowMessageSenderDeps {
  log: WorkerLoggerClass;
  sleep: (ms: number) => Promise<void>;
}

export async function sendMessage(
  deps: FlowMessageSenderDeps,
  user: string,
  text: string,
  workspaceId?: string,
): Promise<Record<string, unknown>> {
  const provider = await ProviderRegistry.getProviderForUser(user, workspaceId);
  if (!provider) {
    throw new Error('Nenhum provider para este usuário');
  }

  const workspace = ((provider as never as Record<string, unknown>).workspace as {
    id: string;
  }) || { id: 'default' };
  let contactId: string | null = null;
  let conversationId: string | null = null;

  // Rate Limiter Check
  const { RateLimiter } = await import('../providers/rate-limiter');
  const allowedWorkspace = await RateLimiter.checkLimit(workspace.id);
  const allowedNumber = await RateLimiter.checkNumberLimit(workspace.id, user);
  if (!allowedWorkspace || !allowedNumber) {
    deps.log.warn('rate_limit_exceeded', { workspaceId: workspace.id, user });
    throw new Error('Limite de envio excedido. Tente novamente mais tarde.');
  }

  // Watchdog & Retries
  const { Watchdog } = await import('../providers/watchdog');
  const { HealthMonitor } = await import('../providers/health-monitor');
  const MAX_RETRIES = 3;
  let lastError: unknown;
  const sendWithRetry = async (attempt: number): Promise<Record<string, unknown>> => {
    if (attempt >= MAX_RETRIES) {
      throw lastError;
    }

    const start = Date.now();
    try {
      if (!(await Watchdog.isHealthy(workspace.id))) {
        throw new Error('Instância instável (Circuit Breaker)');
      }

      deps.log.info('send_message', { user, workspaceId: workspace.id, attempt: attempt + 1 });
      const result = await provider.sendText(workspace, user, text);
      const latency = Date.now() - start;
      const externalId = extractExternalId(result);

      await Watchdog.heartbeat(workspace.id);
      await HealthMonitor.updateMetrics(workspace.id, true, latency);
      await HealthMonitor.reportStatus(workspace.id, 'CONNECTED');

      // Persist outbound for analytics/inbox
      try {
        const contact = await prisma.contact.upsert({
          where: { workspaceId_phone: { workspaceId: workspace.id, phone: user } },
          update: {},
          create: { workspaceId: workspace.id, phone: user, name: user },
        });
        contactId = contact.id;

        let conversation = await prisma.conversation.findFirst({
          where: { workspaceId: workspace.id, contactId: contact.id, status: { not: 'CLOSED' } },
          select: { id: true },
        });
        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              workspaceId: workspace.id,
              contactId: contact.id,
              status: 'OPEN',
              channel: 'WHATSAPP',
              priority: 'MEDIUM',
            },
            select: { id: true },
          });
        }
        conversationId = conversation.id;

        const created = await prisma.message.create({
          data: {
            workspaceId: workspace.id,
            contactId: contact.id,
            conversationId: conversation.id,
            content: text,
            direction: 'OUTBOUND',
            type: 'TEXT',
            status: 'SENT',
            externalId: externalId || undefined,
          },
        });

        await prisma.conversation.updateMany({
          where: { id: conversation.id, workspaceId: workspace.id },
          data: { lastMessageAt: new Date(), unreadCount: 0 },
        });

        // Notifica realtime (via Redis → backend WebSocket)
        try {
          await redisPub.publish(
            'ws:inbox',
            JSON.stringify({
              type: 'message:new',
              workspaceId: workspace.id,
              message: created,
            }),
          );
          await redisPub.publish(
            'ws:inbox',
            JSON.stringify({
              type: 'conversation:update',
              workspaceId: workspace.id,
              conversation: {
                id: conversation.id,
                lastMessageStatus: 'SENT',
                lastMessageAt: created.createdAt,
              },
            }),
          );
        } catch (pubErr) {
          deps.log.warn('ws_publish_failed', {
            error: pubErr instanceof Error ? pubErr.message : String(pubErr),
          });
        }
        try {
          await redisPub.publish(
            'ws:inbox',
            JSON.stringify({
              type: 'message:status',
              workspaceId: workspace.id,
              payload: {
                id: created.id,
                conversationId: conversation.id,
                contactId: contact.id,
                externalId: externalId || undefined,
                status: 'SENT',
              },
            }),
          );
        } catch (pubErr) {
          deps.log.warn('ws_publish_failed_status', {
            error: pubErr instanceof Error ? pubErr.message : String(pubErr),
          });
        }
      } catch (err) {
        deps.log.warn('persist_outbound_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return result;
    } catch (err) {
      const latency = Date.now() - start;
      lastError = err;
      await Watchdog.reportError(workspace.id, err instanceof Error ? err.message : String(err));
      await HealthMonitor.updateMetrics(workspace.id, false, latency);
      if (contactId && conversationId) {
        try {
          await prisma.message.create({
            data: {
              workspaceId: workspace.id,
              contactId,
              conversationId,
              content: text,
              direction: 'OUTBOUND',
              type: 'TEXT',
              status: 'FAILED',
              errorCode: err instanceof Error ? err.message : String(err),
              externalId: undefined,
            },
          });
        } catch (persistErr) {
          deps.log.warn('persist_outbound_failed_errorpath', {
            error: persistErr instanceof Error ? persistErr.message : String(persistErr),
          });
        }

        try {
          await redisPub.publish(
            'ws:inbox',
            JSON.stringify({
              type: 'message:status',
              workspaceId: workspace.id,
              payload: {
                conversationId,
                contactId,
                status: 'FAILED',
                errorCode: err instanceof Error ? err.message : String(err),
              },
            }),
          );
        } catch (pubErr) {
          deps.log.warn('ws_publish_failed_errorpath', {
            error: pubErr instanceof Error ? pubErr.message : String(pubErr),
          });
        }
      }

      const delay = Math.min(1000 * 2 ** (attempt + 1), 10000) + randomInt(500);
      await deps.sleep(delay);

      if ((err instanceof Error ? err.message : String(err))?.includes('400')) {
        throw err;
      }

      return sendWithRetry(attempt + 1);
    }
  };

  return sendWithRetry(0);
}
