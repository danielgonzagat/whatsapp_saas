import {
  buildAnthropicSiteRequestBody,
  buildOpenAiSiteRequestBody,
  buildSiteSlug,
  buildSiteSystemPrompt,
  extractAnthropicSiteHtml,
  extractOpenAiSiteHtml,
  INSUFFICIENT_WALLET_MESSAGE,
  resolveSiteProviderPreference,
  resolveSiteRequestId,
  SITE_GENERATION_MAX_OUTPUT_TOKENS,
} from './site.controller.helpers';

describe('site.controller.helpers', () => {
  describe('resolveSiteProviderPreference', () => {
    it('prefers OpenAI when both keys are set', () => {
      expect(resolveSiteProviderPreference({ openaiKey: 'sk-foo', anthropicKey: 'ant-bar' })).toBe(
        'openai',
      );
    });

    it('falls back to Anthropic when only that key is set', () => {
      expect(resolveSiteProviderPreference({ openaiKey: undefined, anthropicKey: 'ant-bar' })).toBe(
        'anthropic',
      );
    });

    it('returns null when neither key is configured', () => {
      expect(
        resolveSiteProviderPreference({ openaiKey: undefined, anthropicKey: undefined }),
      ).toBeNull();
    });

    it('treats empty string keys as unset', () => {
      expect(resolveSiteProviderPreference({ openaiKey: '', anthropicKey: '' })).toBeNull();
    });
  });

  describe('buildSiteSystemPrompt', () => {
    it('omits the current-HTML line when none is provided', () => {
      const prompt = buildSiteSystemPrompt({});
      expect(prompt).toContain('landing page generator');
      expect(prompt).not.toContain('current HTML');
    });

    it('includes the prior HTML when editing an existing page', () => {
      const prompt = buildSiteSystemPrompt({ currentHtml: '<h1>Hello</h1>' });
      expect(prompt).toContain('Here is the current HTML');
      expect(prompt).toContain('<h1>Hello</h1>');
    });
  });

  describe('buildSiteSlug', () => {
    it('lowercases, strips diacritics, collapses spaces, and appends id suffix', () => {
      expect(buildSiteSlug({ name: 'Minha Loja Açaí', id: 'abcdef123456' })).toBe(
        'minha-loja-acai-abcdef',
      );
    });

    it('defaults to "site" when the name is missing', () => {
      expect(buildSiteSlug({ name: null, id: 'abcdef123456' })).toBe('site-abcdef');
    });

    it('trims leading/trailing hyphens introduced by punctuation', () => {
      expect(buildSiteSlug({ name: '!!!Hello!!!', id: 'xyz123456' })).toBe('hello-xyz123');
    });
  });

  describe('buildOpenAiSiteRequestBody', () => {
    it('shapes the chat-completions payload with system+user messages', () => {
      const body = buildOpenAiSiteRequestBody({
        model: 'gpt-4o-mini',
        systemPrompt: 'sys',
        prompt: 'usr',
      });
      expect(body).toMatchObject({
        model: 'gpt-4o-mini',
        max_tokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'usr' },
        ],
      });
    });
  });

  describe('buildAnthropicSiteRequestBody', () => {
    it('shapes the messages payload with system field + user message', () => {
      const body = buildAnthropicSiteRequestBody({
        model: 'claude-sonnet-4-5',
        systemPrompt: 'sys',
        prompt: 'usr',
      });
      expect(body).toMatchObject({
        model: 'claude-sonnet-4-5',
        max_tokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
        system: 'sys',
        messages: [{ role: 'user', content: 'usr' }],
      });
    });
  });

  describe('extractOpenAiSiteHtml', () => {
    it('returns the trimmed first choice content', () => {
      expect(
        extractOpenAiSiteHtml({
          choices: [{ message: { content: '  <html></html>  ' } }],
        }),
      ).toBe('<html></html>');
    });

    it('returns null when there is no choice', () => {
      expect(extractOpenAiSiteHtml({ choices: [] })).toBeNull();
      expect(extractOpenAiSiteHtml({})).toBeNull();
    });

    it('returns null when the content is empty after trimming', () => {
      expect(extractOpenAiSiteHtml({ choices: [{ message: { content: '   ' } }] })).toBeNull();
    });
  });

  describe('extractAnthropicSiteHtml', () => {
    it('returns the trimmed first content text', () => {
      expect(extractAnthropicSiteHtml({ content: [{ text: '  <html></html>  ' }] })).toBe(
        '<html></html>',
      );
    });

    it('returns null when the content array is empty', () => {
      expect(extractAnthropicSiteHtml({ content: [] })).toBeNull();
      expect(extractAnthropicSiteHtml({})).toBeNull();
    });
  });

  describe('resolveSiteRequestId', () => {
    it('returns the trimmed idempotency key when present', () => {
      expect(resolveSiteRequestId({ idempotencyKey: '  abc-123  ', fallback: 'gen' })).toBe(
        'abc-123',
      );
    });

    it('returns the fallback when the key is missing', () => {
      expect(resolveSiteRequestId({ idempotencyKey: undefined, fallback: 'gen' })).toBe('gen');
    });

    it('returns the fallback when the key is whitespace-only', () => {
      expect(resolveSiteRequestId({ idempotencyKey: '   ', fallback: 'gen' })).toBe('gen');
    });
  });

  describe('INSUFFICIENT_WALLET_MESSAGE', () => {
    it('is the canonical PT-BR message', () => {
      expect(INSUFFICIENT_WALLET_MESSAGE).toMatch(/Saldo insuficiente/);
    });
  });
});
