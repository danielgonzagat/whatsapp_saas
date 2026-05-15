import { Logger } from '@nestjs/common';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

interface SendMessageDeps {
  isWahaMode: () => boolean;
  wahaProvider: WahaProvider | undefined;
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
    if (deps.isWahaMode()) {
      if (deps.wahaProvider === undefined) {
        const error = new Error('waha_provider_unavailable');
        void deps.opsAlert?.alertOnCriticalError(error, 'WhatsAppProviderRegistry.sendMessage', {
          workspaceId,
          metadata: { provider: 'waha', reason: 'missing_waha_provider' },
        });
        deps.logger.error(`Send failed: ${error.message}`);
        return { success: false, error: error.message };
      }

      const result = options?.mediaUrl
        ? await deps.wahaProvider.sendMediaFromUrl(
            workspaceId,
            to,
            options.mediaUrl,
            options.caption || message,
            options.mediaType || 'image',
          )
        : await deps.wahaProvider.sendMessage(workspaceId, to, message);
      const messageRecord = deps.readRecord(deps.readRecord(result).message);
      const msgId = typeof messageRecord.id === 'string' ? messageRecord.id : undefined;
      return {
        success: Boolean(deps.readRecord(result).success),
        ...(msgId !== undefined ? { messageId: msgId } : {}),
      };
    }

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
      metadata: { provider: deps.isWahaMode() ? 'waha' : 'meta-cloud' },
    });
    deps.logger.error(`Send failed: ${msg}`);
    return { success: false, error: msg || 'send_failed' };
  }
}
