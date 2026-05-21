import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

function readConfiguredValue(config: ConfigService, keys: string[]): string | null {
  for (const key of keys) {
    const value = String(config.get<string>(key) || process.env[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function resolveRedirectUri(config: ConfigService): string {
  const explicit = readConfiguredValue(config, ['GOOGLE_MAILBOX_REDIRECT_URI']);
  if (explicit) {
    return explicit;
  }
  const backendUrl = readConfiguredValue(config, [
    'BACKEND_PUBLIC_URL',
    'PUBLIC_API_URL',
    'API_PUBLIC_URL',
  ]);
  if (!backendUrl) {
    throw new ServiceUnavailableException('backend_public_url_not_configured');
  }
  return `${backendUrl.replace(/\/+$/, '')}/marketing/connect/email/gmail/callback`;
}

export function requireClientId(config: ConfigService): string {
  const value = readConfiguredValue(config, ['GOOGLE_MAILBOX_CLIENT_ID', 'GOOGLE_CLIENT_ID']);
  if (!value) {
    throw new ServiceUnavailableException('google_mailbox_client_id_not_configured');
  }
  return value;
}

export function requireClientSecret(config: ConfigService): string {
  const value = readConfiguredValue(config, [
    'GOOGLE_MAILBOX_CLIENT_SECRET',
    'GOOGLE_CLIENT_SECRET',
  ]);
  if (!value) {
    throw new ServiceUnavailableException('google_mailbox_client_secret_not_configured');
  }
  return value;
}

export function readStateSecret(config: ConfigService): string {
  const explicit = readConfiguredValue(config, [
    'EMAIL_OAUTH_STATE_SECRET',
    'EMAIL_TOKEN_ENCRYPTION_KEY',
    'JWT_SECRET',
  ]);
  if (!explicit) {
    throw new ServiceUnavailableException('email_oauth_state_secret_not_configured');
  }
  return explicit;
}

export function resolveFrontendUrl(config: ConfigService): string {
  return (
    readConfiguredValue(config, ['FRONTEND_URL', 'NEXT_PUBLIC_APP_URL']) || 'http://localhost:3000'
  ).replace(/\/+$/, '');
}
