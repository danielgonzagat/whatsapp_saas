import { BadRequestException } from '@nestjs/common';
import {
  buildAllowlistedAudioFetchUrl,
  collectAudioAllowlist,
  DATA_AUDIO_BASE64_PREFIX_RE,
  EMPTY_AUDIO_TOKEN_ESTIMATE,
  estimateAudioTextTokens,
  MIN_AUDIO_TOKEN_ESTIMATE,
  sanitizeAudioPath,
  sanitizeAudioQuery,
  stripAudioBase64Prefix,
} from './audio.helpers';

describe('audio.helpers', () => {
  describe('estimateAudioTextTokens', () => {
    it('returns the empty estimate when all chunks are blank', () => {
      expect(estimateAudioTextTokens()).toBe(EMPTY_AUDIO_TOKEN_ESTIMATE);
      expect(estimateAudioTextTokens('', undefined, '   ')).toBe(EMPTY_AUDIO_TOKEN_ESTIMATE);
    });

    it('returns the minimum estimate for short text', () => {
      expect(estimateAudioTextTokens('hi')).toBe(MIN_AUDIO_TOKEN_ESTIMATE);
    });

    it('scales with text length using a chars-per-token heuristic', () => {
      const long = 'a'.repeat(2000); // 2000 / 4 = 500 tokens
      expect(estimateAudioTextTokens(long)).toBe(500);
    });

    it('joins multiple chunks before estimating', () => {
      const result = estimateAudioTextTokens('alpha', 'beta', undefined);
      expect(result).toBeGreaterThanOrEqual(MIN_AUDIO_TOKEN_ESTIMATE);
    });
  });

  describe('stripAudioBase64Prefix', () => {
    it('strips data:audio/<format>;base64, prefixes for alpha-only formats', () => {
      // Note: the canonical regex uses [a-z]+, so digit-containing formats
      // like "mp3" intentionally fall through unchanged.
      expect(stripAudioBase64Prefix('data:audio/wav;base64,SGVsbG8=')).toBe('SGVsbG8=');
      expect(stripAudioBase64Prefix('data:audio/ogg;base64,QUJDRA==')).toBe('QUJDRA==');
      expect(stripAudioBase64Prefix('data:audio/mpeg;base64,Zm9v')).toBe('Zm9v');
    });

    it('returns the original string when no prefix matches', () => {
      expect(stripAudioBase64Prefix('SGVsbG8=')).toBe('SGVsbG8=');
    });

    it('matches the canonical prefix regex', () => {
      expect(DATA_AUDIO_BASE64_PREFIX_RE.test('data:audio/wav;base64,xxx')).toBe(true);
      expect(DATA_AUDIO_BASE64_PREFIX_RE.test('data:image/png;base64,xxx')).toBe(false);
    });
  });

  describe('sanitizeAudioPath', () => {
    it('accepts a conservative file-like path', () => {
      expect(sanitizeAudioPath('/clips/audio_01.mp3')).toBe('/clips/audio_01.mp3');
    });

    it('defaults a missing path to root', () => {
      expect(sanitizeAudioPath('')).toBe('/');
    });

    it('rejects unsupported characters', () => {
      expect(() => sanitizeAudioPath('/clips/audio@bad.mp3')).toThrow(BadRequestException);
      expect(() => sanitizeAudioPath('/clips/audio?inj=1')).toThrow(BadRequestException);
    });
  });

  describe('sanitizeAudioQuery', () => {
    it('returns empty string for missing query', () => {
      expect(sanitizeAudioQuery('')).toBe('');
    });

    it('accepts safe query strings', () => {
      expect(sanitizeAudioQuery('?token=abc&format=mp3')).toBe('?token=abc&format=mp3');
    });

    it('rejects unsupported characters', () => {
      expect(() => sanitizeAudioQuery('?bad=@@')).toThrow(BadRequestException);
    });
  });

  describe('collectAudioAllowlist', () => {
    afterEach(() => {
      delete process.env.AUDIO_FETCH_ALLOWLIST;
      delete process.env.CDN_BASE_URL;
      delete process.env.MEDIA_BASE_URL;
      delete process.env.R2_PUBLIC_URL;
    });

    it('throws when no env vars are configured', () => {
      expect(() => collectAudioAllowlist()).toThrow(BadRequestException);
    });

    it('returns the hosts from AUDIO_FETCH_ALLOWLIST and CDN_BASE_URL', () => {
      process.env.AUDIO_FETCH_ALLOWLIST = 'cdn.kloel.com';
      process.env.CDN_BASE_URL = 'https://cdn.kloel.com';
      const hosts = collectAudioAllowlist();
      expect(hosts.has('cdn.kloel.com')).toBe(true);
    });
  });

  describe('buildAllowlistedAudioFetchUrl', () => {
    it('rebuilds the URL with origin taken verbatim from the allowlist', () => {
      const input = new URL('https://cdn.kloel.com/audio/clip.mp3?token=abc');
      const out = buildAllowlistedAudioFetchUrl(input, new Set(['cdn.kloel.com']));
      expect(out.hostname).toBe('cdn.kloel.com');
      expect(out.pathname).toBe('/audio/clip.mp3');
      expect(out.search).toBe('?token=abc');
      expect(out.protocol).toBe('https:');
    });

    it('rejects hosts that are not in the allowlist', () => {
      const input = new URL('https://evil.example.com/audio.mp3');
      expect(() => buildAllowlistedAudioFetchUrl(input, new Set(['cdn.kloel.com']))).toThrow(
        BadRequestException,
      );
    });

    it('propagates path sanitization errors', () => {
      const input = new URL('https://cdn.kloel.com/audio@bad.mp3');
      expect(() => buildAllowlistedAudioFetchUrl(input, new Set(['cdn.kloel.com']))).toThrow(
        BadRequestException,
      );
    });

    it('matches host comparison case-insensitively', () => {
      const input = new URL('https://CDN.KLOEL.COM/clip.mp3');
      const out = buildAllowlistedAudioFetchUrl(input, new Set(['cdn.kloel.com']));
      expect(out.hostname).toBe('cdn.kloel.com');
    });
  });
});
