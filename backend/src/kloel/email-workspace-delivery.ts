import type { Prisma } from '@prisma/client';
import { decryptString, isEncrypted } from '../lib/crypto';
import type { EmailDeliveryOverride } from './email-smtp-delivery';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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

function decryptWorkspaceSecret(value: unknown): string | undefined {
  const encrypted = readString(value);
  if (!encrypted || !isEncrypted(encrypted)) return undefined;
  const key = readString(process.env.ENCRYPTION_KEY);
  if (!key) return undefined;
  try {
    return decryptString(encrypted, key);
  } catch {
    return undefined;
  }
}

export function readWorkspaceEmailDelivery(
  config: Prisma.JsonValue | null | undefined,
): EmailDeliveryOverride | null {
  const root = asRecord(config);
  const raw = asRecord(root?.emailDelivery);
  if (!raw) return null;

  const provider = readString(raw.provider);
  if (provider !== 'resend' && provider !== 'sendgrid' && provider !== 'smtp') {
    return null;
  }

  const smtp = asRecord(raw.smtp);
  return {
    provider,
    fromEmail: readString(raw.fromEmail),
    fromName: readString(raw.fromName),
    resendApiKey: provider === 'resend' ? decryptWorkspaceSecret(raw.apiKeyEncrypted) : undefined,
    sendgridApiKey:
      provider === 'sendgrid' ? decryptWorkspaceSecret(raw.apiKeyEncrypted) : undefined,
    ...(provider === 'smtp' && smtp
      ? {
          smtp: {
            host: readString(smtp.host) ?? '',
            port: readNumber(smtp.port),
            secure: smtp.secure === true,
            user: readString(smtp.user),
            pass: decryptWorkspaceSecret(smtp.passwordEncrypted),
          },
        }
      : {}),
  };
}

export function isWorkspaceDeliveryReady(delivery: EmailDeliveryOverride | null): boolean {
  if (!delivery?.provider) return false;
  if (delivery.provider === 'resend') return Boolean(delivery.resendApiKey);
  if (delivery.provider === 'sendgrid') return Boolean(delivery.sendgridApiKey);
  return Boolean(delivery.smtp?.host && delivery.smtp.user && delivery.smtp.pass);
}
