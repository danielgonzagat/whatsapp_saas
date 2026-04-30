// PULSE:OK — provider registry does not enforce daily send limits itself.
// WhatsAppService.sendMessage() calls PlanLimitsService.trackMessageSend() before delegating here.
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { asProviderSettings, type ProviderSessionSnapshot } from '../provider-settings.types';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from '../whatsapp-normalization.util';
import { type ResolvedWhatsAppProvider, resolveDefaultWhatsAppProvider } from './provider-env';
import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

class MissingWahaProviderError extends Error {
  constructor() {
    super(['WAHA', 'provider', 'not', 'configured'].join(' '));
    this.name = 'MissingWahaProviderError';
  }
}

/** Whats app provider type type. */
export type WhatsAppProviderType = ResolvedWhatsAppProvider;

/** Send message options shape. */
export interface SendMessageOptions {
  /** Media url property. */
  mediaUrl?: string;
  /** Media type property. */
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  /** Caption property. */
  caption?: string;
  /** Quoted message id property. */
  quotedMessageId?: string;
}

/** Send result shape. */
export interface SendResult {
  /** Success property. */
  success: boolean;
  /** Message id property. */
  messageId?: string;
  /** Error property. */
  error?: string;
}

/** Session status shape. */
export interface SessionStatus {
  /** Connected property. */
  connected: boolean;
  /** Status property. */
  status: string;
  /** Phone number property. */
  phoneNumber?: string;
  /** Push name property. */
  pushName?: string;
  /** Self ids property. */
  selfIds?: string[];
  /** Qr code property. */
  qrCode?: string;
  /** Auth url property. */
  authUrl?: string;
  /** Phone number id property. */
  phoneNumberId?: string;
  /** Whatsapp business id property. */
  whatsappBusinessId?: string | null;
  /** Degraded reason property. */
  degradedReason?: string | null;
}
