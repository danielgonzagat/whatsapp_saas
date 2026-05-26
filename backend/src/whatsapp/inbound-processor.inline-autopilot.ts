import { Logger } from '@nestjs/common';

import { resolveConversationOwner } from './agent-conversation-state.util';
import { forEachSequential } from '../common/async-sequence';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import type { OpsAlertService } from '../observability/ops-alert.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { Redis } from 'ioredis';
import type { UnifiedAgentService } from '../kloel/unified-agent.service';
interface MinimalWhatsappService {
  sendMessage(
    ws: string,
    to: string,
    message: string,
    opts?: Record<string, unknown>,
  ): Promise<unknown>;
}

function readSendResult(result: unknown): { error: boolean; message: string | null } {
  if (!result || typeof result !== 'object') {
    return { error: false, message: null };
  }
  const record = result as Record<string, unknown>;
  return {
    error: record.error === true,
    message: typeof record.message === 'string' ? record.message : null,
  };
}
import type { ProviderSettings } from './provider-settings.types';
import {
  buildPendingInboundBatchExt,
  shouldBypassHumanLockExt,
  shouldAutoReclaimHumanLockExt,
  hasOutboundActionExt,
  buildInlineFallbackReplyExt,
} from './inbound-processor.helpers';
import { normalizePhone } from './inbound-processor.helpers';

function getSharedReplyLockKey(
  workspaceId: string,
  contactId?: string | null,
  phone?: string | null,
): string {
  return `autopilot:reply:${workspaceId}:${contactId || normalizePhone(String(phone || ''))}`;
}

import { sleep } from '../common/async-sequence';

async function recordAutopilotSkip(
  deps: {
    prisma: PrismaService;
    logger: Logger;
    opsAlert?: OpsAlertService;
  },
  workspaceId: string,
  contactId: string,
  reason: string,
  meta?: Record<string, unknown>,
) {
  try {
    await deps.prisma.autopilotEvent.create({
      data: {
        workspaceId,
        contactId,
        intent: 'INLINE_AUTOPILOT',
        action: 'SKIP_INLINE_REPLY',
        status: 'skipped',
        reason,
        meta: toPrismaJsonValue(meta ?? {}),
      },
    });
  } catch (error: unknown) {
    deps.logger.warn(
      `[AUTOPILOT] Falha ao registrar skip: ${(error instanceof Error ? error : new Error(String(error))).message}`,
    );
    void deps.opsAlert?.alertOnCriticalError(error, 'InboundProcessorService.recordAutopilotSkip', {
      workspaceId,
    });
  }
}

export interface InlineAutopilotInput {
  workspaceId: string;
  contactId: string;
  phone: string;
  messageContent: string;
  messageId: string;
  providerMessageId: string;
  source: string;
  reason: 'inline_reactive_primary' | 'worker_unavailable';
  settings?: ProviderSettings;
}

export interface InlineAutopilotDeps {
  prisma: PrismaService;
  redis: Redis;
  unifiedAgent: UnifiedAgentService;
  whatsappService: MinimalWhatsappService;
  opsAlert?: OpsAlertService;
  logger: Logger;
  contactDebounceMs: number;
  sharedReplyLockMs: number;
}

export async function executeInlineAutopilot(
  deps: InlineAutopilotDeps,
  input: InlineAutopilotInput,
) {
  const conversation = await deps.prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      OR: [{ contactId: input.contactId }, { contact: { phone: input.phone } }],
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      mode: true,
      status: true,
      assignedAgentId: true,
      lastMessageAt: true,
      messages: {
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: { direction: true, createdAt: true },
      },
    },
  });
  const owner = resolveConversationOwner(conversation);
  const bypass = shouldBypassHumanLockExt(input.settings);
  const reclaim = shouldAutoReclaimHumanLockExt(input.settings, conversation);
  if (conversation && owner !== 'AGENT' && reclaim) {
    await deps.prisma.conversation.updateMany({
      where: { id: conversation.id, workspaceId: input.workspaceId },
      data: { mode: 'AI', assignedAgentId: null },
    });
    await recordAutopilotSkip(
      deps,
      input.workspaceId,
      input.contactId,
      'human_lock_auto_reclaimed',
      {
        conversationId: conversation.id,
        previousMode: conversation.mode || null,
        previousAssignedAgentId: conversation.assignedAgentId || null,
      },
    );
  }
  if (conversation && owner !== 'AGENT' && !bypass && !reclaim) {
    await recordAutopilotSkip(deps, input.workspaceId, input.contactId, 'human_mode_lock', {
      conversationId: conversation.id,
      mode: conversation.mode || null,
      status: conversation.status || null,
      assignedAgentId: conversation.assignedAgentId || null,
    });
    return;
  }
  const inlineKey = `autopilot:inline:${input.workspaceId}:${input.contactId}`;
  const reserved = await deps.redis.set(
    inlineKey,
    input.messageId,
    'PX',
    Math.max(5000, deps.contactDebounceMs + 3000),
    'NX',
  );
  if (reserved !== 'OK') {
    return;
  }
  const replyLockKey = getSharedReplyLockKey(input.workspaceId, input.contactId, input.phone);
  const replyRsv = await deps.redis.set(
    replyLockKey,
    input.messageId,
    'PX',
    deps.sharedReplyLockMs,
    'NX',
  );
  if (replyRsv !== 'OK') {
    return;
  }
  let keepReplyLock = false;
  await sleep(deps.contactDebounceMs);
  const pendingBatch = await buildPendingInboundBatchExt(
    { prisma: deps.prisma },
    {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: input.phone,
      fallbackMessageContent: input.messageContent,
      fallbackProviderMessageId: input.providerMessageId,
    },
  );
  const aggMsg = pendingBatch?.aggregatedMessage || input.messageContent;
  const latestQid = pendingBatch?.latestQuotedMessageId || input.providerMessageId;
  try {
    const result = await deps.unifiedAgent.processIncomingMessage({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: input.phone,
      message: aggMsg,
      channel: 'whatsapp',
      context: {
        source: input.source,
        deliveryMode: 'reactive',
        messageId: input.messageId,
        providerMessageId: latestQid,
        pendingQuotedMessageIds: pendingBatch?.messages.map((m) => m.quotedMessageId),
        pendingMessageCount: pendingBatch?.messages.length || 1,
        forceDirect: true,
      },
    });
    if (hasOutboundActionExt(result?.actions || [])) {
      keepReplyLock = true;
      return;
    }
    const reply = String(
      result?.reply || result?.response || buildInlineFallbackReplyExt(aggMsg),
    ).trim();
    if (!reply) {
      return;
    }
    const replyPlan = await deps.unifiedAgent.buildQuotedReplyPlan({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      phone: input.phone,
      draftReply: reply,
      customerMessages: pendingBatch?.messages || [
        { content: input.messageContent, quotedMessageId: latestQid },
      ],
    });
    await forEachSequential(replyPlan, async (plan, index) => {
      const r = await deps.whatsappService.sendMessage(input.workspaceId, input.phone, plan.text, {
        externalId: `inline:${input.messageId}:${index + 1}`,
        complianceMode: 'reactive',
        forceDirect: true,
        quotedMessageId: plan.quotedMessageId || latestQid,
      });
      const sendResult = readSendResult(r);
      if (sendResult.error) {
        deps.logger.error(
          `[AUTOPILOT] Inline reply failed: ${sendResult.message || 'send_failed'}`,
        );
      }
    });
    keepReplyLock = true;
  } catch (agentError: unknown) {
    deps.logger.error(
      `[AUTOPILOT] Inline agent failed: ${(agentError instanceof Error ? agentError : new Error(String(agentError))).message}`,
    );
    void deps.opsAlert?.alertOnCriticalError(
      agentError,
      'InboundProcessorService.triggerInlineAutopilot',
      {
        workspaceId: input.workspaceId,
        metadata: { contactId: input.contactId, phone: input.phone },
      },
    );

    const fallbackReply = buildInlineFallbackReplyExt(aggMsg);
    if (fallbackReply) {
      try {
        const r = await deps.whatsappService.sendMessage(
          input.workspaceId,
          input.phone,
          fallbackReply,
          {
            externalId: `inline:${input.messageId}:fallback`,
            complianceMode: 'reactive',
            forceDirect: true,
            quotedMessageId: latestQid,
          },
        );
        if (!readSendResult(r).error) {
          keepReplyLock = true;
        }
      } catch (fallbackErr: unknown) {
        deps.logger.error(
          `[AUTOPILOT] Fallback reply also failed: ${(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr))).message}`,
        );
      }
    }
  } finally {
    if (!keepReplyLock) {
      try {
        await deps.redis.del(replyLockKey);
      } catch {
        /* best-effort */
      }
    }
  }
}
