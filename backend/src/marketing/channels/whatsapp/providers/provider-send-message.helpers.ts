import { Logger } from '@nestjs/common';
import { OpsAlertService } from '../../../../observability/ops-alert.service';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

interface SendMessageDeps {
  metaCloudProvider: WhatsAppApiProvider;
  opsAlert: OpsAlertService | undefined;
  logger: Logger;
  readRecord: (value: unknown) => Record<string, unknown>;
}

type SendMessageOptions = {
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  quotedMessageId?: string;
};

type SendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export async function sendMessage(
  deps: SendMessageDeps,
  workspaceId: string,
  to: string,
  message: string,
  options?: SendMessageOptions,
): Promise<SendResult> {
  try {
    const result = options?.mediaUrl
      ? await deps.metaCloudProvider.sendMediaFromUrl(
          workspaceId,
          to,
          options.mediaUrl,
          options.caption || message,
          options.mediaType || 'image',
          {
            ...(options.quotedMessageId !== undefined
              ? { quotedMessageId: options.quotedMessageId }
              : {}),
          },
        )
      : await deps.metaCloudProvider.sendMessage(workspaceId, to, message, {
          ...(options?.quotedMessageId !== undefined
            ? { quotedMessageId: options.quotedMessageId }
            : {}),
        });
    const metaMsgId = result?.message?.id;
    return {
      success: Boolean(result?.success),
      ...(typeof metaMsgId === 'string' ? { messageId: metaMsgId } : {}),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    void deps.opsAlert?.alertOnCriticalError(error, 'WhatsAppProviderRegistry.sendMessage', {
      workspaceId,
      metadata: { provider: 'meta-cloud' },
    });
    deps.logger.error(`Send failed: ${msg}`);
    return { success: false, error: msg || 'send_failed' };
  }
}
