import {
  asUnknownRecord,
  buildAnthropicSiteBody,
  buildCapabilityPrompt,
  buildGeneratedImageFilename,
  codeNativeSearchWeb,
  composeAbortSignal,
  computeRetryDelayMs,
  ERR_IMAGE_API_KEY_MISSING,
  ERR_SITE_API_KEY_MISSING,
  extractAnthropicHtml,
  extractAnthropicUsageTokens,
  extractImageUrlFromResponse,
  extractTotalTokens,
  formatSearchDigestAsMarkdown,
  formatSiteRetryExhaustedMessage,
  generatedImageStorageFolder,
  INVALID_RE,
  isModelInvalidError,
  MODEL_RE,
  normalizeWebSearchSources,
  shouldRetryAnthropicStatus,
  shouldTrackTokenUsage,
} from './kloel-composer.service.helpers';

describe('error constants — no literal raw API key string', () => {
  it('builds the OPENAI key error without storing the literal substring', () => {
    expect(ERR_IMAGE_API_KEY_MISSING).toContain('OPENAI');
    expect(ERR_IMAGE_API_KEY_MISSING).toContain('configurada');
  });

  it('builds the ANTHROPIC key error without storing the literal substring', () => {
    expect(ERR_SITE_API_KEY_MISSING).toContain('ANTHROPIC');
    expect(ERR_SITE_API_KEY_MISSING).toContain('configurada');
  });
});

describe('asUnknownRecord', () => {
  it('returns the record for plain objects', () => {
    const record = { a: 1, b: 'two' };
    expect(asUnknownRecord(record)).toBe(record);
  });

  it('returns null for arrays', () => {
    expect(asUnknownRecord([1, 2, 3])).toBeNull();
  });

  it('returns null for primitives, null and undefined', () => {
    expect(asUnknownRecord(null)).toBeNull();
    expect(asUnknownRecord(undefined)).toBeNull();
    expect(asUnknownRecord('hi')).toBeNull();
    expect(asUnknownRecord(42)).toBeNull();
    expect(asUnknownRecord(true)).toBeNull();
  });
});

describe('composeAbortSignal', () => {
  it('returns the timeout signal directly when no caller signal is provided', () => {
    const timeoutController = new AbortController();
    const composed = composeAbortSignal(undefined, timeoutController.signal);
    expect(composed).toBe(timeoutController.signal);
  });

  it('aborts when the caller signal aborts', () => {
    const callerController = new AbortController();
    const timeoutController = new AbortController();
    const composed = composeAbortSignal(callerController.signal, timeoutController.signal);
    expect(composed.aborted).toBe(false);
    callerController.abort(new Error('caller-cancel'));
    expect(composed.aborted).toBe(true);
  });

  it('aborts when the timeout signal aborts', () => {
    const callerController = new AbortController();
    const timeoutController = new AbortController();
    const composed = composeAbortSignal(callerController.signal, timeoutController.signal);
    expect(composed.aborted).toBe(false);
    timeoutController.abort(new Error('timeout'));
    expect(composed.aborted).toBe(true);
  });

  it('is already aborted if the caller signal was already aborted', () => {
    const callerController = new AbortController();
    callerController.abort(new Error('pre-aborted'));
    const timeoutController = new AbortController();
    const composed = composeAbortSignal(callerController.signal, timeoutController.signal);
    expect(composed.aborted).toBe(true);
  });
});

describe('buildCapabilityPrompt', () => {
  it('combines message and context separated by a blank line', () => {
    expect(buildCapabilityPrompt('hello', 'ctx')).toBe('hello\n\nctx');
  });

  it('trims both sides', () => {
    expect(buildCapabilityPrompt('  hello  ', '  ctx  ')).toBe('hello\n\nctx');
  });

  it('omits empty / whitespace-only context', () => {
    expect(buildCapabilityPrompt('hello', '')).toBe('hello');
    expect(buildCapabilityPrompt('hello', '   ')).toBe('hello');
    expect(buildCapabilityPrompt('hello', undefined)).toBe('hello');
  });

  it('coerces non-string message safely', () => {
    expect(buildCapabilityPrompt(null as unknown as string)).toBe('');
    expect(buildCapabilityPrompt(undefined as unknown as string)).toBe('');
  });
});

describe('formatSearchDigestAsMarkdown', () => {
  it('renders body plus numbered sources block', () => {
    const md = formatSearchDigestAsMarkdown({
      answer: 'answer text',
      sources: [
        { title: 'First', url: 'https://a.test' },
        { title: 'Second', url: 'https://b.test' },
      ],
    });
    expect(md).toBe(
      'answer text\n\nFontes:\n- [1] First — https://a.test\n- [2] Second — https://b.test',
    );
  });

  it('falls back to URL when title is empty', () => {
    const md = formatSearchDigestAsMarkdown({
      answer: 'a',
      sources: [{ title: '', url: 'https://x.test' }],
    });
    expect(md).toContain('- [1] https://x.test — https://x.test');
  });

  it('returns just the body when sources is empty', () => {
    const md = formatSearchDigestAsMarkdown({ answer: 'just text', sources: [] });
    expect(md).toBe('just text');
  });

  it('substitutes default text for empty answer', () => {
    const md = formatSearchDigestAsMarkdown({ answer: '   ', sources: [] });
    expect(md).toBe('Nenhum resultado confiável foi encontrado.');
  });
});

describe('codeNativeSearchWeb', () => {
  it('returns an empty unavailable digest for empty queries', () => {
    expect(codeNativeSearchWeb('')).toEqual({ answer: '', sources: [], totalTokens: 0 });
    expect(codeNativeSearchWeb('   ')).toEqual({ answer: '', sources: [], totalTokens: 0 });
  });

  it('lists the queried terms (max 5, len > 2) in the unavailable answer', () => {
    const digest = codeNativeSearchWeb('como criar campanha de email no kloel hoje');
    expect(digest.sources).toEqual([]);
    expect(digest.totalTokens).toBe(0);
    expect(digest.answer).toContain('Pesquisa web indisponível');
    expect(digest.answer).toContain('"como"');
    expect(digest.answer).toContain('"criar"');
    // 'de' and 'no' filtered out (length <= 2); should be at most 5 quoted terms
    const quoted = digest.answer.match(/"[^"]+"/g) ?? [];
    expect(quoted.length).toBeLessThanOrEqual(5);
  });

  it('uses the fallback phrasing when every word is short', () => {
    const digest = codeNativeSearchWeb('a b c');
    expect(digest.answer).toContain('os termos informados');
  });
});

describe('normalizeWebSearchSources', () => {
  it('returns empty when output is not an array', () => {
    expect(normalizeWebSearchSources(undefined)).toEqual([]);
    expect(normalizeWebSearchSources({})).toEqual([]);
    expect(normalizeWebSearchSources('nope')).toEqual([]);
  });

  it('flattens nested action.sources, dedupes by URL, caps at 6', () => {
    const items = [
      {
        action: {
          sources: [
            { title: 'A', url: 'https://a.test' },
            { title: 'B', url: 'https://b.test' },
            { title: 'Adup', url: 'https://a.test' },
          ],
        },
      },
      {
        action: {
          sources: [
            { title: 'C', url: 'https://c.test' },
            { name: 'D', url: 'https://d.test' },
            { title: 'E', url: 'https://e.test' },
            { title: 'F', url: 'https://f.test' },
            { title: 'G', url: 'https://g.test' }, // 7th — should be dropped
          ],
        },
      },
    ];
    const result = normalizeWebSearchSources(items);
    expect(result).toHaveLength(6);
    expect(result.map((s) => s.url)).toEqual([
      'https://a.test',
      'https://b.test',
      'https://c.test',
      'https://d.test',
      'https://e.test',
      'https://f.test',
    ]);
    // name fallback wins when title absent
    expect(result[3]).toEqual({ title: 'D', url: 'https://d.test' });
  });

  it('drops sources with no URL', () => {
    const items = [{ action: { sources: [{ title: 'no-url' }, { url: '   ' }] } }];
    expect(normalizeWebSearchSources(items)).toEqual([]);
  });

  it('falls back to URL when title and name are both empty', () => {
    const items = [{ action: { sources: [{ url: 'https://only-url.test' }] } }];
    expect(normalizeWebSearchSources(items)).toEqual([
      { title: 'https://only-url.test', url: 'https://only-url.test' },
    ]);
  });
});

describe('extractTotalTokens', () => {
  it('reads numeric total_tokens', () => {
    expect(extractTotalTokens({ total_tokens: 42 })).toBe(42);
  });

  it('returns 0 for missing, null, or non-numeric values', () => {
    expect(extractTotalTokens(undefined)).toBe(0);
    expect(extractTotalTokens(null)).toBe(0);
    expect(extractTotalTokens({})).toBe(0);
    expect(extractTotalTokens({ total_tokens: null })).toBe(0);
    expect(extractTotalTokens({ total_tokens: 'lots' })).toBe(0);
  });
});

describe('shouldTrackTokenUsage', () => {
  it('returns true only for finite positive numbers', () => {
    expect(shouldTrackTokenUsage(1)).toBe(true);
    expect(shouldTrackTokenUsage(0.5)).toBe(true);
  });

  it('returns false for zero, negatives, NaN and Infinity', () => {
    expect(shouldTrackTokenUsage(0)).toBe(false);
    expect(shouldTrackTokenUsage(-1)).toBe(false);
    expect(shouldTrackTokenUsage(Number.NaN)).toBe(false);
    expect(shouldTrackTokenUsage(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('extractImageUrlFromResponse', () => {
  it('prefers a direct URL when present', () => {
    expect(extractImageUrlFromResponse({ data: [{ url: 'https://img.test/a.png' }] })).toBe(
      'https://img.test/a.png',
    );
  });

  it('builds a data URI from b64 when no URL is available', () => {
    expect(extractImageUrlFromResponse({ data: [{ b64_json: 'AAAA' }] })).toBe(
      'data:image/png;base64,AAAA',
    );
  });

  it('returns empty string when neither url nor b64 is present', () => {
    expect(extractImageUrlFromResponse({ data: [{}] })).toBe('');
    expect(extractImageUrlFromResponse(undefined)).toBe('');
    expect(extractImageUrlFromResponse({})).toBe('');
  });
});

describe('buildGeneratedImageFilename', () => {
  it('uses workspaceId when present', () => {
    expect(buildGeneratedImageFilename('ws-1', 100)).toBe('kloel-image-ws-1-100.png');
  });

  it('falls back to "workspace" when workspaceId is missing', () => {
    expect(buildGeneratedImageFilename(undefined, 200)).toBe('kloel-image-workspace-200.png');
  });

  it('defaults to Date.now() when no timestamp is supplied', () => {
    const name = buildGeneratedImageFilename('w');
    expect(name).toMatch(/^kloel-image-w-\d+\.png$/);
  });
});

describe('generatedImageStorageFolder', () => {
  it('namespaces folders per workspace', () => {
    expect(generatedImageStorageFolder('ws-1')).toBe('kloel/ws-1/generated-images');
  });

  it('uses a shared folder when no workspace is given', () => {
    expect(generatedImageStorageFolder(undefined)).toBe('kloel/generated-images');
    expect(generatedImageStorageFolder('')).toBe('kloel/generated-images');
  });
});

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
  it('retries 429 and any 5xx', () => {
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
