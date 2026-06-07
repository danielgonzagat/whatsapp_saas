import {
  MAX_ORIGIN_PATTERN_LENGTH,
  compileCorsOriginMatcher,
  matchesWildcardPattern,
  normalizeCorsOriginPattern,
} from './main.helpers';

describe('main.helpers', () => {
  describe('matchesWildcardPattern', () => {
    it('returns true for an exact (wildcard-free) match', () => {
      expect(matchesWildcardPattern('https://kloel.com', 'https://kloel.com')).toBe(true);
    });

    it('returns false for an exact mismatch with no wildcards', () => {
      expect(matchesWildcardPattern('https://kloel.com', 'https://evil.com')).toBe(false);
    });

    it('matches a prefix wildcard', () => {
      expect(matchesWildcardPattern('https://a.kloel.com', '*.kloel.com')).toBe(true);
      expect(matchesWildcardPattern('https://a.evil.com', '*.kloel.com')).toBe(false);
    });

    it('matches a suffix wildcard', () => {
      expect(matchesWildcardPattern('https://kloel-frontend-abc', 'https://kloel-frontend-*')).toBe(
        true,
      );
      expect(matchesWildcardPattern('https://kloel-admin-abc', 'https://kloel-frontend-*')).toBe(
        false,
      );
    });

    it('matches a middle wildcard', () => {
      expect(matchesWildcardPattern('https://a.kloel.com', 'https://*.kloel.com')).toBe(true);
      expect(matchesWildcardPattern('https://kloel.com', 'https://*.kloel.com')).toBe(false);
    });

    it('matches with multiple wildcards', () => {
      expect(matchesWildcardPattern('https://preview-abc.kloel.com', 'https://*-*.kloel.com')).toBe(
        true,
      );
      expect(matchesWildcardPattern('https://kloel.com', 'https://*-*.kloel.com')).toBe(false);
    });

    it('treats a lone "*" as match-all', () => {
      expect(matchesWildcardPattern('anything', '*')).toBe(true);
      expect(matchesWildcardPattern('', '*')).toBe(true);
    });

    it('does not allow a prefix-only match when the pattern has a suffix', () => {
      // value matches the prefix but not the suffix
      expect(matchesWildcardPattern('https://kloel.com.evil', 'https://*.kloel.com')).toBe(false);
    });

    it('requires the prefix to match when the pattern does not start with *', () => {
      expect(matchesWildcardPattern('http://kloel.com', 'https://*.kloel.com')).toBe(false);
    });

    it('handles consecutive wildcards (empty segment) gracefully', () => {
      expect(matchesWildcardPattern('https://a.kloel.com', 'https://**.kloel.com')).toBe(true);
    });

    it('treats empty pattern as exact match only', () => {
      expect(matchesWildcardPattern('', '')).toBe(true);
      expect(matchesWildcardPattern('x', '')).toBe(false);
    });
  });

  describe('normalizeCorsOriginPattern', () => {
    it('returns null for empty / whitespace-only input', () => {
      expect(normalizeCorsOriginPattern('')).toBeNull();
      expect(normalizeCorsOriginPattern('   ')).toBeNull();
    });

    it('returns null when the trimmed input exceeds the length cap', () => {
      const warn = jest.fn();
      const long = `https://${'a'.repeat(MAX_ORIGIN_PATTERN_LENGTH)}.com`;
      expect(normalizeCorsOriginPattern(long, warn)).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        '[CORS] Origin pattern too long, ignored (%d chars)',
        long.length,
      );
    });

    it('strips ^ / $ anchors and regex-escaped dots', () => {
      expect(normalizeCorsOriginPattern('^https://kloel\\.com$')).toBe('https://kloel.com');
    });

    it('rewrites regex-style ".*" into glob "*"', () => {
      expect(normalizeCorsOriginPattern('^https://.*\\.kloel\\.com$')).toBe('https://*.kloel.com');
    });

    it('accepts http and https schemes', () => {
      expect(normalizeCorsOriginPattern('http://localhost:3000')).toBe('http://localhost:3000');
      expect(normalizeCorsOriginPattern('https://kloel.com')).toBe('https://kloel.com');
    });

    it('rejects patterns with disallowed characters', () => {
      const warn = jest.fn();
      expect(normalizeCorsOriginPattern('ftp://kloel.com', warn)).toBeNull();
      expect(normalizeCorsOriginPattern('https://kloel.com?foo=bar', warn)).toBeNull();
      expect(normalizeCorsOriginPattern('https://kloel.com/path with space', warn)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(3);
    });

    it('trims surrounding whitespace before validation', () => {
      expect(normalizeCorsOriginPattern('  https://kloel.com  ')).toBe('https://kloel.com');
    });

    it('returns null and warns when result fails the allowlist regex', () => {
      const warn = jest.fn();
      expect(normalizeCorsOriginPattern('not-a-url', warn)).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        '[CORS] Unsupported origin pattern ignored: %s',
        'not-a-url',
      );
    });

    it('falls back to console.warn when no warn callback is provided', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        expect(normalizeCorsOriginPattern('not-a-url')).toBeNull();
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('compileCorsOriginMatcher', () => {
    it('returns null for invalid raw patterns', () => {
      const warn = jest.fn();
      expect(compileCorsOriginMatcher('', warn)).toBeNull();
      expect(compileCorsOriginMatcher('garbage', warn)).toBeNull();
    });

    it('returns a working matcher for valid wildcard patterns', () => {
      const matcher = compileCorsOriginMatcher('^https://.*\\.kloel\\.com$');
      expect(matcher).not.toBeNull();
      const fn = matcher;
      expect(fn('https://a.kloel.com')).toBe(true);
      expect(fn('https://x.y.kloel.com')).toBe(true);
      expect(fn('https://kloel.com')).toBe(false);
      expect(fn('http://a.kloel.com')).toBe(false);
    });

    it('returns a matcher that handles plain (non-wildcard) origins', () => {
      const matcher = compileCorsOriginMatcher('https://kloel.com');
      expect(matcher).not.toBeNull();
      const fn = matcher;
      expect(fn('https://kloel.com')).toBe(true);
      expect(fn('https://kloel.com.evil')).toBe(false);
    });
  });
});
