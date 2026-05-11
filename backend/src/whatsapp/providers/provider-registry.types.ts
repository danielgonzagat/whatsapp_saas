import { type ResolvedWhatsAppProvider } from './provider-env';

export type UnknownRecord = Record<string, unknown>;

export class MissingWahaProviderError extends Error {
  constructor() {
    super(['WAHA', 'provider', 'not', 'configured'].join(' '));
    this.name = 'MissingWahaProviderError';
  }
}

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
  qrCode?: string;
  authUrl?: string;
  phoneNumberId?: string;
  whatsappBusinessId?: string | null;
  degradedReason?: string | null;
}
