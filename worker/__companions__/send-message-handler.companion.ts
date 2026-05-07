import { type Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { PlanLimitsProvider } from '../providers/plan-limits';
import { HealthMonitor } from '../providers/health-monitor';
import { WhatsAppEngine } from '../providers/whatsapp-engine';
import { getWhatsAppProviderFromEnv } from '../providers/whatsapp-provider-resolver';
import { redisPub } from '../redis-client';
import { getErrorMessage } from '../utils/error-message';

const DEFAULT_WHATSAPP_PROVIDER = getWhatsAppProviderFromEnv();
const log = new WorkerLogger('send-message');

type ProviderSendResponse = {
  messages?: Array<{ id?: string | null } | null | undefined> | null;
  message?: { id?: string | null } | null;
  id?: string | null;
  messageId?: string | null;
  sid?: string | null;
} | null;

const extractExternalId = (res: ProviderSendResponse): string | null =>
  res?.messages?.[0]?.id || res?.message?.id || res?.id || res?.messageId || res?.sid || null;

export async function handleSendMessage(job: Job) {
  const { to, message, user, workspaceId, workspace: initialWorkspace } = job.data ?? {};
  let workspace = initialWorkspace;
  const {
    mediaUrl,
    mediaType,
    caption,
    template,
    externalId: jobExternalId,
    quotedMessageId,
    chatId,
  } = job.data ?? {};
  const start = Date.now();
  let contactId: string | null = null;
  let conversationId: string | null = null;

  // Lazy load workspace config if not provided
  if (!workspace && workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (ws) {
      workspace = {
        id: ws.id,
        whatsappProvider: DEFAULT_WHATSAPP_PROVIDER,
        jitterMin: ws.jitterMin,
        jitterMax: ws.jitterMax,
      };
    }
  }

  log.info('send_start', { jobId: job.id, workspaceId: workspace?.id || workspaceId, to });

  if (!workspace || !to) {
    log.warn('send_invalid_job', { jobId: job.id, data: job.data });
    return { error: true, reason: 'invalid_job_data' };
  }

  // 1. Check Plan Limits (Messages per Month)
  const limitCheck = await PlanLimitsProvider.checkMessageLimit(workspace.id);
  if (!limitCheck.allowed) {
    log.warn('send_blocked_limit', {
      jobId: job.id,
      workspaceId: workspace.id,
      reason: limitCheck.reason,
    });
    return { error: true, reason: limitCheck.reason, skipped: true };
  }

  const targetUser = user || to;

  try {
    // Prepara contato/conversa para registrar status
    try {
      const contact = await prisma.contact.upsert({
        where: { workspaceId_phone: { workspaceId: workspace.id, phone: targetUser } },
        update: {},
        create: {
          workspaceId: workspace.id,
          phone: targetUser,
          name: null,
        },
      });
      contactId = contact.id;

      const existing = await prisma.conversation.findFirst({
        where: { workspaceId: workspace.id, contactId, status: { not: 'CLOSED' } },
        select: { id: true },
      });
      if (existing) {
        conversationId = existing.id;
      } else {
        const conv = await prisma.conversation.create({
          data: {
            workspaceId: workspace.id,
            contactId,
            status: 'OPEN',
            channel: 'WHATSAPP',
            priority: 'MEDIUM',
          },
          select: { id: true },
        });
        conversationId = conv.id;
      }
    } catch (prepErr) {
      log.warn('send_prepare_persist_failed', {
        error: prepErr instanceof Error ? prepErr.message : String(prepErr),
      });
    }

    let res: Awaited<ReturnType<typeof WhatsAppEngine.sendText>> | undefined;
    if (template?.name) {
      res = await WhatsAppEngine.sendTemplate(
        workspace,
        targetUser,
        template.name,
        template.language || 'en_US',
        template.components || [],
      );
    } else if (mediaUrl && mediaType) {
      res = await WhatsAppEngine.sendMedia(
        workspace,
        targetUser,
        mediaType,
        mediaUrl,
        caption || message,
        {
          quotedMessageId,
          chatId,
        },
      );
    } else {
      res = await WhatsAppEngine.sendText(workspace, targetUser, message, {
        quotedMessageId,
        chatId,
      });
    }
    const latency = Date.now() - start;

    // Detect provider-level errors that didn't throw (common in HTTP 200 with { error })
    const providerError = (res && (res.error || res.err || res.status === 'error')) || null;

    await HealthMonitor.updateMetrics(workspace.id, !providerError, latency);
    if (!providerError) {
      await HealthMonitor.reportStatus(workspace.id, 'CONNECTED');
    }

    const msgType = mediaType ? mediaType.toUpperCase() : template?.name ? 'TEMPLATE' : 'TEXT';
    const externalId = jobExternalId || extractExternalId(res);

    // Persist outbound message for analytics/inbox visibility
    if (contactId && conversationId) {
      try {
        const created = await prisma.message.create({
          data: {
            id: uuidv4(),
            workspaceId: workspace.id,
            contactId,
            conversationId,
            content: caption || message || mediaUrl || '',
            direction: 'OUTBOUND',
            type: msgType,
            mediaUrl: mediaUrl || undefined,
            status: providerError ? 'FAILED' : 'SENT',
            errorCode: providerError ? String(providerError) : null,
            externalId: externalId || undefined,
          },
        });

        await prisma.conversation.updateMany({
          where: { id: conversationId, workspaceId: workspace.id },
          data: { lastMessageAt: new Date(), unreadCount: 0 },
        });

        // Notifica realtime (via Redis → backend WebSocket)
        const payload = {
          type: 'message:new',
          workspaceId: workspace.id,
          message: created,
        };
        await redisPub.publish('ws:inbox', JSON.stringify(payload));
        await redisPub.publish(
          'ws:inbox',
          JSON.stringify({
            type: 'conversation:update',
            workspaceId: workspace.id,
            conversation: {
              id: conversationId,
              lastMessageStatus: providerError ? 'FAILED' : 'SENT',
              lastMessageErrorCode: providerError ? String(providerError) : null,
              lastMessageAt: created.createdAt,
            },
          }),
        );
        await redisPub.publish(
          'ws:inbox',
          JSON.stringify({
            type: 'message:status',
            workspaceId: workspace.id,
            payload: {
              id: created.id,
              conversationId,
              contactId,
              externalId,
              status: providerError ? 'FAILED' : 'SENT',
              errorCode: providerError ? String(providerError) : null,
            },
          }),
        );
      } catch (dbErr) {
        log.warn('send_persist_failed', {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
    }

    if (providerError) {
      log.warn('send_provider_error', {
        jobId: job.id,
        workspaceId: workspace.id,
        to,
        error: providerError,
      });
      throw new Error(String(providerError));
    }

    log.info('send_completed', { jobId: job.id, workspaceId: workspace.id, to, latency });
    return { ok: true, result: res };
  } catch (err) {
    const latency = Date.now() - start;
    const maxAttempts = typeof job.opts?.attempts === 'number' ? job.opts.attempts : 1;
    const finalFailure =
      job.attemptsMade + 1 >= maxAttempts || getErrorMessage(err) === 'session_expired';

    // Health Check Failure
    await HealthMonitor.updateMetrics(workspace.id, false, latency);
    log.error('send_failed', { jobId: job.id, error: err });

    // Persist failure for analytics
    if (finalFailure && contactId && conversationId) {
      try {
        await prisma.message.create({
          data: {
            id: uuidv4(),
            workspaceId: workspace.id,
            contactId,
            conversationId,
            content: caption || message || mediaUrl || '',
            direction: 'OUTBOUND',
            type: mediaType ? mediaType.toUpperCase() : template?.name ? 'TEMPLATE' : 'TEXT',
            mediaUrl: mediaUrl || undefined,
            status: 'FAILED',
            errorCode: getErrorMessage(err),
            externalId: undefined,
          },
        });
      } catch (dbErr) {
        log.warn('send_persist_failed_errorpath', {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
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
              errorCode: getErrorMessage(err),
            },
          }),
        );
      } catch (pubErr) {
        log.warn('ws_publish_failed_errorpath', {
          error: pubErr instanceof Error ? pubErr.message : String(pubErr),
        });
      }
    }

    // Erros de sessão expirada (24h) não valem retry
    if (getErrorMessage(err) === 'session_expired') {
      return { error: true, reason: 'session_expired', skipped: true };
    }

    // Retry logic handled by BullMQ, but we log health
    throw err;
  }
}
