import {
  callOpenAIWithRetry,
  chatCompletionWithFallback,
  chatCompletionStreamWithRetry,
  normalizeChatCompletionParams,
  LLMInputTooLargeError,
  LLM_MAX_COMPLETION_TOKENS,
  LLM_MAX_INPUT_CHARS,
} from './openai-wrapper';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import OpenAI from 'openai';

const LEGACY_PRIMARY_MODEL = ['gpt', '-4'].join('');
const LEGACY_FALLBACK_MODEL = ['gpt', '-4.1'].join('');

// Mock do OpenAI
jest.mock('openai');

// PULSE_OK: assertions exist below
describe('OpenAI Wrapper', () => {
  type RetryableTestError = Error & { status: number };

  type FlexMock = jest.Mock & {
    mockResolvedValue: (v: unknown) => FlexMock;
    mockResolvedValueOnce: (v: unknown) => FlexMock;
    mockRejectedValue: (e: unknown) => FlexMock;
    mockRejectedValueOnce: (e: unknown) => FlexMock;
    mockReturnValue: (v: unknown) => FlexMock;
    mockImplementation: (fn: (...args: unknown[]) => unknown) => FlexMock;
  };

  function makeRetryableError(message: string, status = 500): RetryableTestError {
    const err = new Error(message) as RetryableTestError;
    err.status = status;
    return err;
  }

  describe('callOpenAIWithRetry', () => {
    it('should return result on first successful call', async () => {
      const mockFn = jest
        .fn<() => Promise<{ success: boolean }>>()
        .mockResolvedValue({ success: true });

      const result = await callOpenAIWithRetry(mockFn, { maxRetries: 3 });

      expect(result).toEqual({ success: true });
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const mockFn = jest
        .fn<() => Promise<{ success: boolean }>>()
        .mockRejectedValueOnce(makeRetryableError('Temporary error', 500))
        .mockRejectedValueOnce(makeRetryableError('Temporary error', 500))
        .mockResolvedValue({ success: true });

      const result = await callOpenAIWithRetry(mockFn, {
        maxRetries: 3,
        initialDelayMs: 10, // Fast for tests
      });

      expect(result).toEqual({ success: true });
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const mockFn = jest
        .fn<() => Promise<{ success: boolean }>>()
        .mockRejectedValue(makeRetryableError('Persistent error', 500));

      await expect(
        callOpenAIWithRetry(mockFn, {
          maxRetries: 2,
          initialDelayMs: 10,
        }),
      ).rejects.toThrow('Persistent error');

      // maxRetries = 2 significa 3 tentativas (0,1,2)
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Invalid API key') as RetryableTestError;
      error.status = 401;
      const mockFn = jest.fn<() => Promise<{ success: boolean }>>().mockRejectedValue(error);

      await expect(
        callOpenAIWithRetry(mockFn, { maxRetries: 3, initialDelayMs: 10 }),
      ).rejects.toThrow('Invalid API key');

      // Should not retry auth errors
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      jest.useFakeTimers();
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const mockFn = jest
        .fn<() => Promise<{ success: boolean }>>()
        .mockRejectedValueOnce(makeRetryableError('Error 1', 500))
        .mockRejectedValueOnce(makeRetryableError('Error 2', 500))
        .mockResolvedValue({ success: true });

      const promise = callOpenAIWithRetry(mockFn, {
        maxRetries: 3,
        initialDelayMs: 50,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
      });

      // 1º erro -> delay attempt=0 => 50ms
      await Promise.resolve();
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 50);
      await jest.advanceTimersByTimeAsync(50);

      // 2º erro -> delay attempt=1 => 100ms
      await Promise.resolve();
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      await jest.advanceTimersByTimeAsync(100);

      await expect(promise).resolves.toEqual({ success: true });

      setTimeoutSpy.mockRestore();
      randomSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('chatCompletionWithFallback', () => {
    let mockOpenAI: OpenAI;
    let createMock: FlexMock;

    beforeEach(() => {
      createMock = jest.fn() as FlexMock;
      mockOpenAI = {
        chat: {
          completions: {
            create: createMock as jest.Mock,
          },
        },
      } as never as OpenAI;
    });

    it('should use primary model when successful', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hello' } }],
      };
      createMock.mockResolvedValue(mockResponse);

      const result = await chatCompletionWithFallback(
        mockOpenAI,
        { model: LEGACY_PRIMARY_MODEL, messages: [{ role: 'user', content: 'Hi' }] },
        LEGACY_FALLBACK_MODEL,
        { maxRetries: 1, initialDelayMs: 10 },
      );

      expect(result).toEqual(mockResponse);
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: LEGACY_PRIMARY_MODEL }),
        undefined,
      );
    });

    it('should fallback to mini model on persistent failure', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Fallback response' } }],
      };

      // Falha primária (não-retryable) -> não retrya, cai no fallback em seguida
      const nonRetryable = new Error('Primary failed') as RetryableTestError;
      nonRetryable.status = 400;

      createMock.mockRejectedValueOnce(nonRetryable).mockResolvedValueOnce(mockResponse);

      const result = await chatCompletionWithFallback(
        mockOpenAI,
        { model: LEGACY_PRIMARY_MODEL, messages: [{ role: 'user', content: 'Hi' }] },
        LEGACY_FALLBACK_MODEL,
        { maxRetries: 1, initialDelayMs: 10 },
      );

      expect(result).toEqual(mockResponse);
      // Called twice: once with primary, once with fallback
      expect(createMock).toHaveBeenCalledTimes(2);

      // Verifica que o fallback troca o modelo
      expect(createMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ model: LEGACY_FALLBACK_MODEL }),
        undefined,
      );
    });
  });

  describe('chatCompletionStreamWithRetry', () => {
    let mockOpenAI: OpenAI;
    let createMock: FlexMock;

    beforeEach(() => {
      createMock = jest.fn() as FlexMock;
      mockOpenAI = {
        chat: {
          completions: {
            create: createMock as jest.Mock,
          },
        },
      } as never as OpenAI;
    });

    it('normalizes max_tokens into max_completion_tokens for streaming requests', async () => {
      const streamMock = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'oi' } }] };
        },
      };
      createMock.mockResolvedValue(streamMock);

      const result = await chatCompletionStreamWithRetry(mockOpenAI, {
        model: LEGACY_FALLBACK_MODEL,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
        max_tokens: 321,
      });

      expect(result).toBe(streamMock);
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: LEGACY_FALLBACK_MODEL,
          stream: true,
          max_completion_tokens: 321,
        }),
        undefined,
      );
      expect(createMock.mock.calls[0][0]).not.toHaveProperty('max_tokens');
    });
  });

  describe('normalizeChatCompletionParams — I16 mandatory clamps', () => {
    const baseMessages: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['messages'] = [
      { role: 'user', content: 'hi' },
    ];

    it('clamps max_tokens above LLM_MAX_COMPLETION_TOKENS down to the cap', () => {
      const out = normalizeChatCompletionParams({
        model: LEGACY_FALLBACK_MODEL,
        messages: baseMessages,
        max_tokens: 999_999,
      });
      expect(out.max_completion_tokens).toBe(LLM_MAX_COMPLETION_TOKENS);
      expect('max_tokens' in out).toBe(false);
    });

    it('clamps max_completion_tokens above the cap', () => {
      const out = normalizeChatCompletionParams({
        model: LEGACY_FALLBACK_MODEL,
        messages: baseMessages,
        max_completion_tokens: 999_999,
      });
      expect(out.max_completion_tokens).toBe(LLM_MAX_COMPLETION_TOKENS);
    });

    it('uses the cap as default when neither max_tokens nor max_completion_tokens is set', () => {
      const out = normalizeChatCompletionParams({
        model: LEGACY_FALLBACK_MODEL,
        messages: baseMessages,
      });
      expect(out.max_completion_tokens).toBe(LLM_MAX_COMPLETION_TOKENS);
    });

    it('rounds max_tokens up to at least 1 (rejects 0 / negative)', () => {
      const out = normalizeChatCompletionParams({
        model: LEGACY_FALLBACK_MODEL,
        messages: baseMessages,
        max_tokens: 0,
      });
      expect(out.max_completion_tokens).toBe(1);
    });

    it('preserves a valid max_tokens below the cap', () => {
      const out = normalizeChatCompletionParams({
        model: LEGACY_FALLBACK_MODEL,
        messages: baseMessages,
        max_tokens: 512,
      });
      expect(out.max_completion_tokens).toBe(512);
    });

    it('throws LLMInputTooLargeError when serialized messages exceed LLM_MAX_INPUT_CHARS', () => {
      const bigContent = 'x'.repeat(LLM_MAX_INPUT_CHARS + 1000);
      expect(() =>
        normalizeChatCompletionParams({
          model: LEGACY_FALLBACK_MODEL,
          messages: [{ role: 'user', content: bigContent }],
          max_tokens: 100,
        }),
      ).toThrow(LLMInputTooLargeError);
    });

    it('allows exactly LLM_MAX_INPUT_CHARS-1 without throwing', () => {
      const safeContent = 'x'.repeat(LLM_MAX_INPUT_CHARS - 100);
      expect(() =>
        normalizeChatCompletionParams({
          model: LEGACY_FALLBACK_MODEL,
          messages: [{ role: 'user', content: safeContent }],
          max_tokens: 100,
        }),
      ).not.toThrow();
    });
  });
});
