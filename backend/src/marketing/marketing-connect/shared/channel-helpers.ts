import { BadRequestException } from '@nestjs/common';
import type { ProviderSettings } from '../../../whatsapp/provider-settings.types';

export type EmailSubSettings = Record<string, unknown> & { enabled?: boolean };
export type WhatsAppStatusValue = Record<string, unknown>;
export type MarketingChannelKey = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | 'email';

export const MARKETING_CHANNEL_KEYS = new Set<MarketingChannelKey>([
  'whatsapp',
  'instagram',
  'facebook',
  'tiktok',
  'email',
]);

export interface MarketingChannelSetupPayload {
  channel?: string;
  currentStep?: unknown;
  selectedProductIds?: unknown;
  arsenal?: unknown;
  config?: unknown;
}

export interface GmailOAuthCompletePayload {
  code?: string;
  state?: string;
}

export interface GmailSyncPayload {
  limit?: unknown;
}

export interface GmailSendTestPayload {
  toEmail?: string;
  subject?: string;
  html?: string;
}

export interface ImapSmtpConnectPayload {
  email?: unknown;
  imapHost?: unknown;
  imapPort?: unknown;
  imapSecure?: unknown;
  imapUsername?: unknown;
  imapPassword?: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpSecure?: unknown;
  smtpUsername?: unknown;
  smtpPassword?: unknown;
}

export interface ConnectEmailBody {
  enabled?: boolean;
}

export interface EmailProviderSnapshot {
  provider: string;
  available: boolean;
  fromEmail: string;
  fromName: string;
  workspaceConfigured: boolean;
}

export function readOptionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function assertMarketingChannel(value: unknown): MarketingChannelKey {
  if (typeof value === 'string' && MARKETING_CHANNEL_KEYS.has(value as MarketingChannelKey)) {
    return value as MarketingChannelKey;
  }
  throw new BadRequestException('invalid_marketing_channel');
}

export function readMarketingChannelSetup(
  providerSettings: ProviderSettings,
  channel: MarketingChannelKey,
): Record<string, unknown> {
  const allSetups =
    providerSettings.marketingChannelSetup &&
    typeof providerSettings.marketingChannelSetup === 'object' &&
    !Array.isArray(providerSettings.marketingChannelSetup)
      ? (providerSettings.marketingChannelSetup as Record<string, unknown>)
      : {};
  const setup = allSetups[channel];
  return setup && typeof setup === 'object' && !Array.isArray(setup)
    ? (setup as Record<string, unknown>)
    : {};
}

export function normalizeStep(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(3, Math.max(0, parsed));
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 100);
}

export function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeArsenal(value: unknown): string[] {
  return normalizeStringArray(value).slice(0, 50);
}
