import { callOpenAIWithRetry, chatCompletionWithFallback } from './openai-wrapper';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import OpenAI from 'openai';

// Mock do OpenAI
jest.mock('openai');

describe('OpenAI Wrapper', () => {
  function makeRetryableError(message: string, status = 500) {
    const err: any = new Error(message);
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
        .fn<() => Promise<any>>()
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
      const error = new Error('Invalid API key') as any;
      error.status = 401;
      const mockFn = jest.fn<() => Promise<any>>().mockRejectedValue(error);
      
      await expect(
        callOpenAIWithRetry(mockFn, { maxRetries: 3, initialDelayMs: 10 }),
      ).rejects.toThrow('Invalid API key');
      
      // Should not retry auth errors
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      jest.useFakeTimers();
      jest.spyOn(Math, 'random').mockReturnValue(0);
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
      (Math.random as any).mockRestore?.();
      jest.useRealTimers();
    });
  });

  describe('chatCompletionWithFallback', () => {
    let mockOpenAI: OpenAI;
    let createMock: any;

    beforeEach(() => {
      createMock = jest.fn();
      mockOpenAI = {
        chat: {
          completions: {
            create: createMock,
          },
        },
      } as any;
    });

    it('should use primary model when successful', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hello' } }],
      };
      createMock.mockResolvedValue(mockResponse as any);
      
      const result = await chatCompletionWithFallback(
        mockOpenAI,
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        'gpt-4o-mini',
        { maxRetries: 1, initialDelayMs: 10 },
      );
      
      expect(result).toEqual(mockResponse);
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' }),
        undefined,
      );
    });

    it('should fallback to mini model on persistent failure', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Fallback response' } }],
      };

      // Falha primária (não-retryable) -> não retrya, cai no fallback em seguida
      const nonRetryable: any = new Error('Primary failed');
      nonRetryable.status = 400;

      createMock
        .mockRejectedValueOnce(nonRetryable)
        .mockResolvedValueOnce(mockResponse as any);
      
      const result = await chatCompletionWithFallback(
        mockOpenAI,
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        'gpt-4o-mini',
        { maxRetries: 1, initialDelayMs: 10 },
      );
      
      expect(result).toEqual(mockResponse);
      // Called twice: once with primary, once with fallback
      expect(createMock).toHaveBeenCalledTimes(2);

      // Verifica que o fallback troca o modelo
      expect(createMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ model: 'gpt-4o-mini' }),
        undefined,
      );
    });
  });
});
