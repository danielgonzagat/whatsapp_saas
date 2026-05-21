import type { Prisma } from '@prisma/client';
import { decryptString, isEncrypted } from '../lib/crypto';
import type { EmailDeliveryOverride } from './email-smtp-delivery';

import { asRecord } from '../common/types';
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isSupportedEmailProvider(
  value: string | undefined,
): value is NonNullable<EmailDeliveryOverride['provider']> {
  return value === 'resend' || value === 'sendgrid' || value === 'smtp';
}

function decryptWorkspaceSecret(value: unknown): string | undefined {
  const encrypted = readString(value);
  if (!encrypted) return undefined;
  if (!isEncrypted(encrypted)) return undefined;
  const key = readString(process.env.ENCRYPTION_KEY);
  if (!key) return undefined;
  try {
    return decryptString(encrypted, key);
  } catch {
    return undefined;
  }
}

function readWorkspaceApiKeys(
  provider: NonNullable<EmailDeliveryOverride['provider']>,
  raw: Record<string, unknown>,
): Pick<EmailDeliveryOverride, 'resendApiKey' | 'sendgridApiKey'> {
  const apiKey = decryptWorkspaceSecret(raw.apiKeyEncrypted);
  if (provider === 'resend' && apiKey !== undefined) {
    return { resendApiKey: apiKey };
  }
  if (provider === 'sendgrid' && apiKey !== undefined) {
    return { sendgridApiKey: apiKey };
  }
  return {};
}

function readWorkspaceSmtp(
  provider: NonNullable<EmailDeliveryOverride['provider']>,
  raw: Record<string, unknown>,
): Pick<EmailDeliveryOverride, 'smtp'> {
  const smtp = asRecord(raw.smtp);
  if (provider !== 'smtp' || !smtp) return {};
  const port = readNumber(smtp.port);
  const user = readString(smtp.user);
  const pass = decryptWorkspaceSecret(smtp.passwordEncrypted);
  return {
    smtp: {
      host: readString(smtp.host) ?? '',
      ...(port !== undefined ? { port } : {}),
      secure: smtp.secure === true,
      ...(user !== undefined ? { user } : {}),
      ...(pass !== undefined ? { pass } : {}),
    },
  };
}

export function readWorkspaceEmailDelivery(
  config: Prisma.JsonValue | null | undefined,
): EmailDeliveryOverride | null {
  const root = asRecord(config);
  const raw = asRecord(root?.emailDelivery);
  if (!raw) return null;

  const provider = readString(raw.provider);
  if (!isSupportedEmailProvider(provider)) {
    return null;
  }

  const fromEmail = readString(raw.fromEmail);
  const fromName = readString(raw.fromName);
  return {
    provider,
    ...(fromEmail !== undefined ? { fromEmail } : {}),
    ...(fromName !== undefined ? { fromName } : {}),
    ...readWorkspaceApiKeys(provider, raw),
    ...readWorkspaceSmtp(provider, raw),
  };
}

export function isWorkspaceDeliveryReady(delivery: EmailDeliveryOverride | null): boolean {
  if (!delivery?.provider) return false;
  if (delivery.provider === 'resend') return Boolean(delivery.resendApiKey);
  if (delivery.provider === 'sendgrid') return Boolean(delivery.sendgridApiKey);
  return Boolean(delivery.smtp?.host && delivery.smtp.user && delivery.smtp.pass);
}
