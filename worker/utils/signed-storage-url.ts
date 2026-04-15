import crypto from 'node:crypto';
import path from 'node:path';

const PATTERN_RE = /\/+$/;
const PATTERN_RE_2 = /^\/+/;

function getSigningSecret(): string {
  return process.env.STORAGE_SIGNING_SECRET || process.env.JWT_SECRET || 'dev-secret-insecure';
}

function getBackendBaseUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    'http://localhost:3001'
  ).replace(PATTERN_RE, '');
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = path.posix
    .normalize(String(relativePath || '').replace(/\\/g, '/'))
    .replace(PATTERN_RE_2, '');

  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('..') ||
    normalized.includes('/../')
  ) {
    throw new Error('invalid_storage_path');
  }

  return normalized;
}

export function buildSignedLocalStorageUrl(
  relativePath: string,
  options: {
    expiresInSeconds?: number;
    downloadName?: string;
  } = {},
): string {
  const payload: { p: string; exp?: number; d?: string } = {
    p: normalizeRelativePath(relativePath),
  };

  if (
    typeof options.expiresInSeconds === 'number' &&
    Number.isFinite(options.expiresInSeconds) &&
    options.expiresInSeconds > 0
  ) {
    payload.exp = Date.now() + options.expiresInSeconds * 1000;
  }

  if (options.downloadName) {
    payload.d = options.downloadName;
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');

  return `${getBackendBaseUrl()}/storage/local/${encodedPayload}.${signature}`;
}
