import { Logger } from '@nestjs/common';
import { ChannelInboundHookService } from '../omnichannel/channel-inbound-hook.service';
import type { InboundMessage } from './inbound-processor.helpers';

interface TriggerWhatsappMindPerceptInput {
  mindHook?: ChannelInboundHookService;
  logger: Pick<Logger, 'error'>;
  msg: InboundMessage;
  contactId: string;
  messageId: string;
  phone: string;
  content: string;
}

export function triggerWhatsappMindPercept(input: TriggerWhatsappMindPerceptInput): void {
  const { mindHook, logger, msg, contactId, messageId, phone, content } = input;
  if (!mindHook || msg.ingestMode === 'catchup') {
    return;
  }

  mindHook
    .onMessageReceived(
      {
        workspaceId: msg.workspaceId,
        channel: 'WHATSAPP',
        externalId: msg.providerMessageId,
        from: phone,
        ...(msg.senderName !== undefined ? { fromName: msg.senderName } : {}),
        content,
        metadata: {
          provider: msg.provider,
          providerMessageId: msg.providerMessageId,
          type: msg.type,
        },
      },
      contactId,
      messageId,
    )
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        `[INBOUND] MIND percept hook failed workspace=${msg.workspaceId} channel=whatsapp: ${message}`,
      );
    });
}
