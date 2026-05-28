import { BadRequestException } from '@nestjs/common';
import { collectAllowedHosts } from '../common/utils/url-validator';

/** Strips the `data:audio/<format>;base64,` prefix from base64 audio payloads. */
export const DATA_AUDIO_BASE64_PREFIX_RE = /^data:audio\/[a-z]+;base64,/;

/** Whitelist regex for audio URL paths — conservative, file-like characters only. */
export const SAFE_AUDIO_PATH_RE = /^\/[A-Za-z0-9._~\-/%]*$/;

/** Whitelist regex for audio URL query strings. */
export const SAFE_AUDIO_QUERY_RE = /^\??[A-Za-z0-9._~\-=&%]*$/;

/** Minimum token estimate used when no text is provided. */
export const MIN_AUDIO_TOKEN_ESTIMATE = 200;

/** Default token estimate when all text chunks are empty. */
export const EMPTY_AUDIO_TOKEN_ESTIMATE = 500;

/** Characters per token heuristic for text-token estimation. */
export const CHARS_PER_TOKEN = 4;

/**
 * Estimates token usage for an audio-adjacent text payload (transcript +
 * language hint, TTS input, etc.). Returns a stable lower bound so callers
 * never under-bill.
 */
export function estimateAudioTextTokens(...chunks: Array<string | undefined>): number {
  const text = chunks.filter(Boolean).join(' ').trim();
  if (!text) {
    return EMPTY_AUDIO_TOKEN_ESTIMATE;
  }
  return Math.max(MIN_AUDIO_TOKEN_ESTIMATE, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/**
 * Removes the data-URL prefix (if present) from a base64-encoded audio
 * payload, returning the raw base64 body suitable for `Buffer.from(_, 'base64')`.
 */
export function stripAudioBase64Prefix(base64Audio: string): string {
  return base64Audio.replace(DATA_AUDIO_BASE64_PREFIX_RE, '');
}

/**
 * Validates that an audio URL path matches the conservative file-like
 * whitelist regex. Throws `BadRequestException` on unsupported characters.
 */
export function sanitizeAudioPath(rawPath: string): string {
  const candidate = rawPath || '/';
  if (!SAFE_AUDIO_PATH_RE.test(candidate)) {
    throw new BadRequestException('Audio URL path contains unsupported characters');
  }
  return candidate;
}

/**
 * Validates that an audio URL query string matches the conservative
 * whitelist regex. Returns empty string for missing/empty input. Throws
 * `BadRequestException` on unsupported characters.
 */
export function sanitizeAudioQuery(rawQuery: string): string {
  const candidate = rawQuery || '';
  if (!candidate) {
    return '';
  }
  if (!SAFE_AUDIO_QUERY_RE.test(candidate)) {
    throw new BadRequestException('Audio URL query contains unsupported characters');
  }
  return candidate;
}

/**
 * Collects the configured audio-fetch allowlist from environment variables
 * (`AUDIO_FETCH_ALLOWLIST`, `CDN_BASE_URL`, `MEDIA_BASE_URL`, `R2_PUBLIC_URL`).
 * Throws `BadRequestException` when no hosts are configured.
 */
export function collectAudioAllowlist(): Set<string> {
  const allowedHosts = collectAllowedHosts(
    process.env.AUDIO_FETCH_ALLOWLIST,
    process.env.CDN_BASE_URL,
    process.env.MEDIA_BASE_URL,
    process.env.R2_PUBLIC_URL,
  );

  if (allowedHosts.size === 0) {
    throw new BadRequestException('AUDIO_FETCH_ALLOWLIST not configured');
  }

  return allowedHosts;
}

/**
 * Rebuilds a fetch-safe URL by taking the origin verbatim from the
 * allowlist entry that matches the requested host, and re-composing the
 * sanitized path/query. Cuts the SSRF taint flow from user-supplied input
 * because the host is server-controlled and the path/query passed a strict
 * whitelist regex.
 *
 * Throws `BadRequestException` when the requested host is not in the
 * allowlist.
 */
export function buildAllowlistedAudioFetchUrl(safeUrl: URL, allowedHosts: Set<string>): URL {
  const requestedHost = safeUrl.hostname.toLowerCase();
  const safePath = sanitizeAudioPath(safeUrl.pathname);
  const safeQuery = sanitizeAudioQuery(safeUrl.search);

  for (const allowed of allowedHosts) {
    if (allowed.toLowerCase() === requestedHost) {
      // Origin taken verbatim from allowlist entry, not user input.
      const origin = `https://${allowed}`;
      return new URL(`${safePath}${safeQuery}`, origin);
    }
  }

  throw new BadRequestException('Host not allowed');
}
