import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { safeResolve } from '../safe-path';
import { WorkerError, isRetryableError, throwIfRetryable } from '../src/utils/error-handler';

describe('worker runtime utility guards', () => {
  it('resolves safe path segments and rejects invalid segments', () => {
    expect(safeResolve('tmp', 'worker-cache')).toBe(path.resolve('tmp', 'worker-cache'));
    expect(() => safeResolve('tmp', 'bad\0segment')).toThrow('safeResolve: null byte');
    expect(() => Reflect.apply(safeResolve, null, ['tmp', 42])).toThrow(TypeError);
  });

  it('honors WorkerError retry flags and permanent message patterns', () => {
    expect(isRetryableError(new WorkerError('retry later', 'RETRY_LATER', true))).toBe(true);
    expect(isRetryableError(new WorkerError('do not retry', 'STOP', false))).toBe(false);
    expect(isRetryableError(new Error('workspace not found'))).toBe(false);
    expect(isRetryableError(new Error('temporary provider timeout'))).toBe(true);
  });

  it('wraps permanent HTTP failures as non-retryable WorkerError', () => {
    const error = Object.assign(new Error('missing'), { response: { status: 404 } });

    try {
      throwIfRetryable(error, 'send');
      throw new Error('expected throwIfRetryable to throw');
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(WorkerError);
      const workerError = thrown as WorkerError;
      expect(workerError.retryable).toBe(false);
      expect(workerError.code).toBe('HTTP_404');
      expect(workerError.metadata).toEqual({ status: 404 });
      expect(workerError.message).toContain('[send] HTTP 404: missing');
    }
  });

  it('rethrows transient Error instances for queue retry', () => {
    const transient = new Error('rate limited');

    try {
      throwIfRetryable(transient, 'scan');
      throw new Error('expected throwIfRetryable to throw');
    } catch (thrown) {
      expect(thrown).toBe(transient);
    }
  });

  it('wraps non-Error transient values with context', () => {
    try {
      throwIfRetryable('timeout', 'scan');
      throw new Error('expected throwIfRetryable to throw');
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe('[scan] timeout');
    }
  });
});
