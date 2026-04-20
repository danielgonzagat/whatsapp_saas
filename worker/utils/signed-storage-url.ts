import crypto from 'node:crypto';
import path from 'node:path';

const BACKSLASH_RE = /\\/g;
const TRAILING_SLASHES_RE = /\/+$/;
const LEADING_SLASHES_RE = /^\/+/;

const getSigningSecret = (): string =>
  process.env.STORAGE_SIGNING_SECRET || process.env.JWT_SECRET || 'dev-secret-insecure';

const getBackendBaseUrl = (): string =>
  (
    process.env.APP_URL ||
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    'http://localhost:3001'
  ).replace(TRAILING_SLASHES_RE, '');

const isInvalidNormalizedPath = (normalized: string): boolean =>
  !normalized || normalized === '.' || normalized.startsWith('..') || normalized.includes('/../');

const normalizeRelativePath = (relativePath: string): string => {
  const normalized = path.posix
    .normalize(String(relativePath || '').replace(BACKSLASH_RE, '/'))
    .replace(LEADING_SLASHES_RE, '');

  if (isInvalidNormalizedPath(normalized)) {
    throw new Error('invalid_storage_path');
  }

  return normalized;
};

const isValidExpiry = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

interface SignedUrlOptions {
  expiresInSeconds?: number;
  downloadName?: string;
}

interface SignedUrlPayload {
  p: string;
  exp?: number;
  d?: string;
}

const buildPayload = (relativePath: string, options: SignedUrlOptions): SignedUrlPayload => {
  const payload: SignedUrlPayload = { p: normalizeRelativePath(relativePath) };
  if (isValidExpiry(options.expiresInSeconds)) {
    payload.exp = Date.now() + options.expiresInSeconds * 1000;
  }
  if (options.downloadName) {
    payload.d = options.downloadName;
  }
  return payload;
};

const signPayload = (encodedPayload: string): string =>
  crypto.createHmac('sha256', getSigningSecret()).update(encodedPayload).digest('base64url');

/** Build signed local storage url. */
export function buildSignedLocalStorageUrl(
  relativePath: string,
  options: SignedUrlOptions = {},
): string {
  const payload = buildPayload(relativePath, options);
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(encodedPayload);
  return `${getBackendBaseUrl()}/storage/local/${encodedPayload}.${signature}`;
}
