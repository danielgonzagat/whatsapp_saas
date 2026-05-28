import {
  asUnknownRecord,
  buildCapabilityPrompt,
  composeAbortSignal,
  ERR_IMAGE_API_KEY_MISSING,
  ERR_SITE_API_KEY_MISSING,
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
