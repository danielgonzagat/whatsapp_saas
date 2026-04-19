import { encryptString, safeDecrypt } from '../lib/crypto';

function resolveWebhookSubscriptionEncryptionKey() {
  return String(process.env.ENCRYPTION_KEY || process.env.PROVIDER_SECRET_KEY || '').trim();
}

export function encryptWebhookSubscriptionSecret(value?: string | null) {
  const secret = decryptWebhookSubscriptionSecret(value);
  if (!secret) return secret;

  const key = resolveWebhookSubscriptionEncryptionKey();
  if (!key) return secret;

  return encryptString(secret, key);
}

export function decryptWebhookSubscriptionSecret(value?: string | null) {
  const secret = String(value || '').trim();
  if (!secret) return secret;

  const key = resolveWebhookSubscriptionEncryptionKey();
  if (!key) return secret;

  return safeDecrypt(secret, key);
}
