import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';

import { safeResolve } from '../safe-path';

const BACKSLASH_RE = /\\/g;
const LEADING_SLASHES_RE = /^\/+/;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'application/pdf': '.pdf',
  'application/json': '.json',
  'text/plain': '.txt',
};

const DEFAULT_MIME = 'application/octet-stream';

/** Read a non-empty trimmed string from ConfigService, returning undefined when missing. */
export function readConfigString(
  config: ConfigService,
  key: string,
  defaultValue?: string,
): string | undefined {
  const value =
    defaultValue === undefined ? config.get<string>(key) : config.get<string>(key, defaultValue);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Map a MIME type to an extension. Returns empty string when unknown. */
export function getExtensionFromMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? '';
}

/** Map a relative path's extension to a MIME type. Falls back to application/octet-stream. */
export function getMimeTypeForPath(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? DEFAULT_MIME;
}

/** Normalize a relative path inside the uploads sandbox, rejecting traversal/null. */
export function normalizeRelativePath(relativePath: string): string {
  const normalized = path.posix
    .normalize(String(relativePath || '').replace(BACKSLASH_RE, '/'))
    .replace(LEADING_SLASHES_RE, '');
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

/** Resolve an absolute path inside the uploads dir, rejecting traversal escapes. */
export function resolveAbsolutePath(uploadsDir: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = safeResolve(uploadsDir, normalized);
  const uploadsRoot = safeResolve(uploadsDir);
  if (fullPath !== uploadsRoot && !fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('invalid_storage_path');
  }
  return fullPath;
}

/** Storage access token payload (signed, optionally expiring). */
export interface StorageTokenPayload {
  p: string;
  exp?: number;
  d?: string;
}

/** Build a signed token payload from a relative path plus optional access options. */
export function buildAccessTokenPayload(
  relativePath: string,
  options: { expiresInSeconds?: number; downloadName?: string } = {},
): StorageTokenPayload {
  const payload: StorageTokenPayload = {
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
  return payload;
}

/** Encode a token payload to its base64url JSON form. */
export function encodeTokenPayload(payload: StorageTokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Decode a base64url JSON payload, throwing the canonical error code on malformed input. */
export function decodeTokenPayload(encodedPayload: string): StorageTokenPayload {
  const raw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  try {
    return JSON.parse(raw) as StorageTokenPayload;
  } catch {
    throw new Error('invalid_storage_token_payload');
  }
}
