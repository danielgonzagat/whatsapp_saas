import {
  buildComposerWebSearchE2EStub,
  isComposerWebSearchE2EStubEnabled,
} from './kloel-composer-web-search-e2e-stub';

describe('kloel-composer-web-search-e2e-stub', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isComposerWebSearchE2EStubEnabled', () => {
    it('returns false when NODE_ENV is production even if dummy key is set', () => {
      process.env.NODE_ENV = 'production';
      process.env.OPENAI_API_KEY = 'e2e-dummy-key';
      expect(isComposerWebSearchE2EStubEnabled()).toBe(false);
    });

    it('returns true when E2E_TEST_MODE is true', () => {
      process.env.NODE_ENV = 'test';
      process.env.E2E_TEST_MODE = 'true';
      expect(isComposerWebSearchE2EStubEnabled()).toBe(true);
    });

    it('returns true when KLOEL_WEB_SEARCH_STUB is true', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.E2E_TEST_MODE;
      process.env.KLOEL_WEB_SEARCH_STUB = 'true';
      expect(isComposerWebSearchE2EStubEnabled()).toBe(true);
    });

    it('returns true when OPENAI_API_KEY is the e2e dummy key', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.E2E_TEST_MODE;
      delete process.env.KLOEL_WEB_SEARCH_STUB;
      process.env.OPENAI_API_KEY = 'e2e-dummy-key';
      expect(isComposerWebSearchE2EStubEnabled()).toBe(true);
    });

    it('returns false when no e2e signals are set', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.E2E_TEST_MODE;
      delete process.env.KLOEL_WEB_SEARCH_STUB;
      delete process.env.OPENAI_API_KEY;
      expect(isComposerWebSearchE2EStubEnabled()).toBe(false);
    });
  });

  describe('buildComposerWebSearchE2EStub', () => {
    it('returns an answer body that mentions the openai.com domain', () => {
      const digest = buildComposerWebSearchE2EStub('site oficial da OpenAI?');
      expect(digest.answer).toMatch(/openai\.com/i);
    });

    it('returns at least one source with the openai.com domain', () => {
      const digest = buildComposerWebSearchE2EStub('OpenAI');
      expect(digest.sources.length).toBeGreaterThan(0);
      expect(digest.sources.some((source) => /openai\.com/i.test(source.url))).toBe(true);
    });

    it('caps the echoed query at 240 characters', () => {
      const longQuery = 'x'.repeat(500);
      const digest = buildComposerWebSearchE2EStub(longQuery);
      expect(digest.answer).toContain('"' + 'x'.repeat(240) + '"');
      expect(digest.answer).not.toContain('x'.repeat(241));
    });

    it('handles empty query input', () => {
      const digest = buildComposerWebSearchE2EStub('');
      expect(digest.answer).toContain('openai.com');
      expect(digest.sources.length).toBeGreaterThan(0);
    });

    it('returns a totalTokens of 0 so the planLimits.trackAiUsage path is skipped', () => {
      const digest = buildComposerWebSearchE2EStub('anything');
      expect(digest.totalTokens).toBe(0);
    });
  });
});
