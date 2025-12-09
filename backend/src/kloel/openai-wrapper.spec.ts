import { callOpenAIWithRetry, chatCompletionWithFallback } from './openai-wrapper';
import OpenAI from 'openai';

// Mock do OpenAI
jest.mock('openai');

describe('OpenAI Wrapper', () => {
  describe('callOpenAIWithRetry', () => {
    it('should return result on first successful call', async () => {
      const mockFn = jest.fn().mockResolvedValue({ success: true });
      
      const result = await callOpenAIWithRetry(mockFn, { maxRetries: 3 });
      
      expect(result).toEqual({ success: true });
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValue({ success: true });
      
      const result = await callOpenAIWithRetry(mockFn, { 
        maxRetries: 3,
        initialDelayMs: 10, // Fast for tests
      });
      
      expect(result).toEqual({ success: true });
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent error'));
      
      await expect(
        callOpenAIWithRetry(mockFn, { 
          maxRetries: 2,
          initialDelayMs: 10,
        }),
      ).rejects.toThrow('Persistent error');
      
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Invalid API key') as any;
      error.status = 401;
      const mockFn = jest.fn().mockRejectedValue(error);
      
      await expect(
        callOpenAIWithRetry(mockFn, { maxRetries: 3, initialDelayMs: 10 }),
      ).rejects.toThrow('Invalid API key');
      
      // Should not retry auth errors
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValue({ success: true });
      
      const start = Date.now();
      await callOpenAIWithRetry(mockFn, { 
        maxRetries: 3,
        initialDelayMs: 50,
      });
      const elapsed = Date.now() - start;
      
      // Should have waited at least 50 + 100 = 150ms (exponential)
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  describe('chatCompletionWithFallback', () => {
    let mockOpenAI: jest.Mocked<OpenAI>;

    beforeEach(() => {
      mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn(),
          },
        },
      } as any;
    });

    it('should use primary model when successful', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hello' } }],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);
      
      const result = await chatCompletionWithFallback(
        mockOpenAI,
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        'gpt-4o-mini',
        { maxRetries: 1, initialDelayMs: 10 },
      );
      
      expect(result).toEqual(mockResponse);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' }),
      );
    });

    it('should fallback to mini model on persistent failure', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Fallback response' } }],
      };
      
      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce(mockResponse as any);
      
      const result = await chatCompletionWithFallback(
        mockOpenAI,
        { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
        'gpt-4o-mini',
        { maxRetries: 1, initialDelayMs: 10 },
      );
      
      expect(result).toEqual(mockResponse);
      // Called twice: once with primary, once with fallback
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });
});
