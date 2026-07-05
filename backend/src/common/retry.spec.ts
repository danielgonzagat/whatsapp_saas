import { retry } from './retry';

describe('retry', () => {
  describe('success cases', () => {
    it('resolves immediately on first success', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await retry(fn, { maxAttempts: 3 });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries after failure and succeeds', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('ok');

      const result = await retry(fn, { maxAttempts: 3, baseDelayMs: 1 });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('succeeds on last allowed attempt', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('a'))
        .mockRejectedValueOnce(new Error('b'))
        .mockRejectedValueOnce(new Error('c'))
        .mockRejectedValueOnce(new Error('d'))
        .mockResolvedValue('finally');

      const result = await retry(fn, { maxAttempts: 5, baseDelayMs: 1 });
      expect(result).toBe('finally');
      expect(fn).toHaveBeenCalledTimes(5);
    });
  });

  describe('failure cases', () => {
    it('throws last error when all attempts exhausted', async () => {
      const lastError = new Error('final');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('first'))
        .mockRejectedValueOnce(lastError);

      await expect(retry(fn, { maxAttempts: 2, baseDelayMs: 1 })).rejects.toThrow('final');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws for maxAttempts = 1 on failure', async () => {
      const error = new Error('boom');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retry(fn, { maxAttempts: 1 })).rejects.toThrow('boom');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('validation', () => {
    it('throws for maxAttempts = 0', async () => {
      await expect(retry(async () => 'x', { maxAttempts: 0 })).rejects.toThrow(
        'maxAttempts must be >= 1',
      );
    });

    it('throws for negative maxAttempts', async () => {
      await expect(retry(async () => 'x', { maxAttempts: -1 })).rejects.toThrow(
        'maxAttempts must be >= 1',
      );
    });
  });

  describe('onRetry callback', () => {
    it('calls onRetry with error and attempt number on each retry', async () => {
      const onRetry = vi.fn();
      const err1 = new Error('e1');
      const err2 = new Error('e2');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(err1)
        .mockRejectedValueOnce(err2)
        .mockResolvedValue('ok');

      await retry(fn, { maxAttempts: 3, baseDelayMs: 1, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, err1, 1);
      expect(onRetry).toHaveBeenNthCalledWith(2, err2, 2);
    });

    it('does not call onRetry when fn succeeds on first attempt', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn().mockResolvedValue('ok');

      await retry(fn, { maxAttempts: 3, baseDelayMs: 1, onRetry });

      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe('backoff timing', () => {
    it('uses exponential backoff (baseDelayMs * 2^attempt)', async () => {
      const timestamps: number[] = [];
      const fn = vi.fn().mockImplementation(() => {
        timestamps.push(Date.now());
        if (timestamps.length < 4) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('ok');
      });

      const start = Date.now();
      await retry(fn, { maxAttempts: 4, baseDelayMs: 50 });
      const elapsed = Date.now() - start;

      // 3 retries: delays = 50*2^0 + 50*2^1 + 50*2^2 = 50 + 100 + 200 = 350ms
      // Allow tolerance for execution overhead
      expect(elapsed).toBeGreaterThanOrEqual(300);
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('defaults baseDelayMs to 100 when not specified', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('ok');

      const start = Date.now();
      await retry(fn, { maxAttempts: 2 });
      const elapsed = Date.now() - start;

      // Default delay = 100ms * 2^0 = 100ms
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });
});
