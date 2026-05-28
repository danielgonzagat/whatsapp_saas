import {
  buildAnthropicSiteBody,
  computeRetryDelayMs,
  extractAnthropicHtml,
  extractAnthropicUsageTokens,
  formatSiteRetryExhaustedMessage,
  INVALID_RE,
  isModelInvalidError,
  MODEL_RE,
  shouldRetryAnthropicStatus,
} from './kloel-composer.service.helpers';

describe('isModelInvalidError', () => {
  it('matches when the message references "model"', () => {
    expect(isModelInvalidError('The model does not exist', '')).toBe(true);
  });

  it('matches when the code references "model"', () => {
    expect(isModelInvalidError('', 'model_not_found')).toBe(true);
  });

  it('matches when the message references "invalid"', () => {
    expect(isModelInvalidError('Request was invalid', '')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isModelInvalidError('temporary failure', 'rate_limit')).toBe(false);
  });

  it('exports the underlying regexes for callers that want to reuse them', () => {
    expect(MODEL_RE.test('the MODEL is bad')).toBe(true);
    expect(INVALID_RE.test('INVALID config')).toBe(true);
  });
});

describe('computeRetryDelayMs', () => {
  it('doubles each attempt starting at the base delay', () => {
    expect(computeRetryDelayMs(0)).toBe(500);
    expect(computeRetryDelayMs(1)).toBe(1000);
    expect(computeRetryDelayMs(2)).toBe(2000);
  });

  it('respects a custom base ms', () => {
    expect(computeRetryDelayMs(0, 100)).toBe(100);
    expect(computeRetryDelayMs(3, 100)).toBe(800);
  });
});

describe('shouldRetryAnthropicStatus', () => {
  it('retries 429 and every 5xx', () => {
    expect(shouldRetryAnthropicStatus(429)).toBe(true);
    expect(shouldRetryAnthropicStatus(500)).toBe(true);
    expect(shouldRetryAnthropicStatus(502)).toBe(true);
    expect(shouldRetryAnthropicStatus(599)).toBe(true);
  });

  it('does not retry 4xx (other than 429) or 2xx', () => {
    expect(shouldRetryAnthropicStatus(200)).toBe(false);
    expect(shouldRetryAnthropicStatus(400)).toBe(false);
    expect(shouldRetryAnthropicStatus(401)).toBe(false);
    expect(shouldRetryAnthropicStatus(404)).toBe(false);
  });
});

describe('buildAnthropicSiteBody', () => {
  it('encodes prompt, system instructions, and default max_tokens', () => {
    const json = buildAnthropicSiteBody({ prompt: 'build a landing page' });
    const parsed = JSON.parse(json) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(parsed.max_tokens).toBe(4096);
    expect(typeof parsed.model).toBe('string');
    expect(parsed.system).toContain('Return only valid HTML');
    expect(parsed.system).toContain('Kloel');
    expect(parsed.messages).toEqual([{ role: 'user', content: 'build a landing page' }]);
  });

  it('appends composer context block when provided', () => {
    const json = buildAnthropicSiteBody({
      prompt: 'p',
      composerContext: 'workspace=foo',
    });
    const parsed = JSON.parse(json) as { system: string };
    expect(parsed.system).toContain('Additional runtime context:\nworkspace=foo');
  });

  it('omits the additional-context line when composerContext is absent', () => {
    const json = buildAnthropicSiteBody({ prompt: 'p' });
    const parsed = JSON.parse(json) as { system: string };
    expect(parsed.system).not.toContain('Additional runtime context');
  });

  it('honors model and maxTokens overrides', () => {
    const json = buildAnthropicSiteBody({
      prompt: 'p',
      model: 'custom-model',
      maxTokens: 1024,
    });
    const parsed = JSON.parse(json) as { model: string; max_tokens: number };
    expect(parsed.model).toBe('custom-model');
    expect(parsed.max_tokens).toBe(1024);
  });
});

describe('extractAnthropicHtml', () => {
  it('returns the trimmed text from the first content block', () => {
    expect(
      extractAnthropicHtml({
        content: [{ text: '  <html>ok</html>  ' }],
      }),
    ).toBe('<html>ok</html>');
  });

  it('returns empty string for missing or empty content', () => {
    expect(extractAnthropicHtml(undefined)).toBe('');
    expect(extractAnthropicHtml({})).toBe('');
    expect(extractAnthropicHtml({ content: [] })).toBe('');
    expect(extractAnthropicHtml({ content: [{ text: '   ' }] })).toBe('');
  });
});

describe('extractAnthropicUsageTokens', () => {
  it('sums input and output tokens', () => {
    expect(
      extractAnthropicUsageTokens({
        usage: { input_tokens: 10, output_tokens: 30 },
      }),
    ).toBe(40);
  });

  it('treats missing fields as zero', () => {
    expect(extractAnthropicUsageTokens({ usage: { input_tokens: 5 } })).toBe(5);
    expect(extractAnthropicUsageTokens({ usage: { output_tokens: 7 } })).toBe(7);
    expect(extractAnthropicUsageTokens({ usage: {} })).toBe(0);
    expect(extractAnthropicUsageTokens({})).toBe(0);
    expect(extractAnthropicUsageTokens(undefined)).toBe(0);
  });
});

describe('formatSiteRetryExhaustedMessage', () => {
  it('quotes the Error message when an Error is thrown', () => {
    const msg = formatSiteRetryExhaustedMessage(3, new Error('boom'));
    expect(msg).toBe('Anthropic site generation failed after 3 attempts: boom');
  });

  it('uses "unknown" for non-Error values', () => {
    expect(formatSiteRetryExhaustedMessage(2, 'oops')).toBe(
      'Anthropic site generation failed after 2 attempts: unknown',
    );
    expect(formatSiteRetryExhaustedMessage(2, undefined)).toBe(
      'Anthropic site generation failed after 2 attempts: unknown',
    );
    expect(formatSiteRetryExhaustedMessage(2, { message: 'looks-like-error' })).toBe(
      'Anthropic site generation failed after 2 attempts: unknown',
    );
  });
});
