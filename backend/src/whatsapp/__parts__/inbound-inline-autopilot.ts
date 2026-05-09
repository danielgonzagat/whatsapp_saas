import type { Logger } from '@nestjs/common';
import type { OpsAlertService } from '../../observability/ops-alert.service';
import { toPrismaJsonValue } from '../../common/prisma/prisma-json.util';
import type { ChannelTransportRegistry } from '../../kloel/channel-transport.registry';
import type { PrismaService } from '../../prisma/prisma.service';

export type InlineReplyPlanItem = {
  text: string;
  quotedMessageId?: string | null;
};

export async function sendInlineReplyPlan(
  deps: { transports: ChannelTransportRegistry; logger: Pick<Logger, 'error'> },
  params: {
    workspaceId: string;
    phone: string;
    messageId: string;
    latestQuotedMessageId: string;
    replyPlan: InlineReplyPlanItem[];
  },
): Promise<void> {
  for (let index = 0; index < params.replyPlan.length; index += 1) {
    const plan = params.replyPlan[index];
    const result = await deps.transports.send(params.workspaceId, {
      workspaceId: params.workspaceId,
      channel: 'whatsapp',
      recipientId: params.phone,
      content: plan.text,
      externalId: `inline:${params.messageId}:${index + 1}`,
      complianceMode: 'reactive',
      forceDirect: true,
      quotedMessageId: plan.quotedMessageId || params.latestQuotedMessageId,
    });
    if (!result?.success) {
      deps.logger.error(
        `[AUTOPILOT] Inline reply failed: ${result.error || result.blockedReason || 'send_failed'}`,
      );
    }
  }
}

export async function sendInlineFallbackReply(
  deps: { transports: ChannelTransportRegistry },
  params: {
    workspaceId: string;
    phone: string;
    messageId: string;
    latestQuotedMessageId: string;
    fallbackReply: string;
  },
): Promise<boolean> {
  const result = await deps.transports.send(params.workspaceId, {
    workspaceId: params.workspaceId,
    channel: 'whatsapp',
    recipientId: params.phone,
    content: params.fallbackReply,
    externalId: `inline:${params.messageId}:fallback`,
    complianceMode: 'reactive',
    forceDirect: true,
    quotedMessageId: params.latestQuotedMessageId,
  });
  return Boolean(result?.success);
}

export async function recordAutopilotSkip(
  deps: { prisma: PrismaService; logger: Pick<Logger, 'warn'>; opsAlert?: OpsAlertService },
  params: {
    workspaceId: string;
    contactId: string;
    reason: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await deps.prisma.autopilotEvent.create({
      data: {
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        intent: 'INLINE_AUTOPILOT',
        action: 'SKIP_INLINE_REPLY',
        status: 'skipped',
        reason: params.reason,
        meta: toPrismaJsonValue(params.meta ?? {}),
      },
    });
  } catch (error: unknown) {
    deps.logger.warn(
      `[AUTOPILOT] Falha ao registrar skip: ${(error instanceof Error ? error : new Error(String(error))).message}`,
    );
    void deps.opsAlert?.alertOnCriticalError(error, 'InboundProcessorService.recordAutopilotSkip', {
      workspaceId: params.workspaceId,
    });
  }
}
