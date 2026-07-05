/**
 * Retries an async function with exponential backoff.
 *
 * Each retry waits `baseDelayMs * 2^attempt` milliseconds before the next
 * attempt. The first call happens immediately (no initial delay).
 *
 * @param fn        The async function to retry.
 * @param options   Retry configuration.
 * @returns         The resolved value of `fn` on success.
 * @throws          The last error if all attempts are exhausted.
 *
 * @example
 * const data = await retry(() => fetchData(), { maxAttempts: 3, baseDelayMs: 100 });
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    baseDelayMs?: number;
    onRetry?: (error: unknown, attempt: number) => void;
  },
): Promise<T> {
  const { maxAttempts, baseDelayMs = 100, onRetry } = options;

  if (maxAttempts < 1) {
    throw new Error(`retry: maxAttempts must be >= 1, got ${maxAttempts}`);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        onRetry?.(error, attempt + 1);
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/** Resolves after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
