import { Logger } from '@nestjs/common';
/**
 * Messaging operations for WhatsApp provider registry.
 *
 * Cohesion: sendMessage delegates to the companion sendMessage helper
 * (provider-send-message.helpers.ts), which handles WAHA vs Meta Cloud
 * routing, media dispatch, error capture, and ops alerting.
 * sendMedia is a convenience wrapper that re-encodes media params
 * as SendMessageOptions before delegating.
 */


import { OpsAlertService } from '../../observability/ops-alert.service';
import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';
import { sendMessage as companionSendMessage } from './provider-send-message.helpers';
import type { UnknownRecord, SendMessageOptions, SendResult } from './provider-registry.types';

export interface MessagingDeps {
  isWahaMode: () => boolean;
  wahaProvider: WahaProvider | undefined;
  metaCloudProvider: WhatsAppApiProvider;
  opsAlert: OpsAlertService | undefined;
  logger: Logger;
  readRecord: (value: unknown) => UnknownRecord;
}

export async function sendMessage(
  deps: MessagingDeps,
  workspaceId: string,
  to: string,
  message: string,
  options?: SendMessageOptions,
): Promise<SendResult> {
  return companionSendMessage(
    {
      isWahaMode: deps.isWahaMode,
      wahaProvider: deps.wahaProvider,
      metaCloudProvider: deps.metaCloudProvider,
      opsAlert: deps.opsAlert,
      logger: deps.logger,
      readRecord: deps.readRecord,
    },
    workspaceId,
    to,
    message,
    options,
  );
}

export async function sendMedia(
  deps: MessagingDeps,
  workspaceId: string,
  to: string,
  mediaUrl: string,
  options?: { caption?: string; mediaType?: 'image' | 'video' | 'audio' | 'document' },
): Promise<SendResult> {
  return sendMessage(deps, workspaceId, to, options?.caption || '', {
    mediaUrl,
    ...(options?.caption !== undefined ? { caption: options.caption } : {}),
    ...(options?.mediaType !== undefined ? { mediaType: options.mediaType } : {}),
  });
}
