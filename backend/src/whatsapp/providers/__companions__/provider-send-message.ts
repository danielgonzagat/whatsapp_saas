import { OpsAlertService } from '../../../observability/ops-alert.service';
import { WahaProvider } from '../waha.provider';
import { WhatsAppApiProvider } from '../whatsapp-api.provider';
import type { Logger } from '@nestjs/common';

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
      const result = options?.mediaUrl
        ? await deps.wahaProvider!.sendMediaFromUrl(
            workspaceId,
            to,
            options.mediaUrl,
            options.caption || message,
            options.mediaType || 'image',
          )
        : await deps.wahaProvider!.sendMessage(workspaceId, to, message);
      const messageRecord = deps.readRecord(deps.readRecord(result).message);
      return {
        success: Boolean(deps.readRecord(result).success),
        messageId: typeof messageRecord.id === 'string' ? messageRecord.id : undefined,
      };
    }

    const result = options?.mediaUrl
      ? await deps.metaCloudProvider.sendMediaFromUrl(
          workspaceId,
          to,
          options.mediaUrl,
          options.caption || message,
          options.mediaType || 'image',
          { quotedMessageId: options.quotedMessageId },
        )
      : await deps.metaCloudProvider.sendMessage(workspaceId, to, message, {
          quotedMessageId: options?.quotedMessageId,
        });
    return {
      success: Boolean(result?.success),
      messageId: result?.message?.id || undefined,
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
