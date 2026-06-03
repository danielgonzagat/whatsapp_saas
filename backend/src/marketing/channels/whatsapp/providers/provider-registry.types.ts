import { type ResolvedWhatsAppProvider } from './provider-env';

import type { UnknownRecord } from '../../../../common/types';
export type { UnknownRecord };

export type WhatsAppProviderType = ResolvedWhatsAppProvider;

export interface SendMessageOptions {
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  quotedMessageId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SessionStatus {
  connected: boolean;
  status: string;
  phoneNumber?: string;
  pushName?: string;
  selfIds?: string[];
  authUrl?: string;
  phoneNumberId?: string;
  whatsappBusinessId?: string | null;
  degradedReason?: string | null;
}
