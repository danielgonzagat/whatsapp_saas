/** Worker error with retry classification. */
export class WorkerError extends Error {
  constructor(
    public message: string,
    public code: string,
    public retryable = true,
    public metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'WorkerError';
  }
}

/** Handle error and return structured info for logging/monitoring. */
export const handleError = (error: unknown, jobName: string) => {
  console.error('[%s] Error: %O', jobName, error);

  if (error instanceof WorkerError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      retryable: error.retryable,
    };
  }

  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
    code: 'UNKNOWN_ERROR',
    retryable: true,
  };
};

/** HTTP status codes that indicate a permanent (non-retryable) failure. */
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 402, 403, 404, 405, 409, 410, 422]);

/** Determine if an error's HTTP status indicates a permanent failure. */
export const isPermanentHttpError = (status: number): boolean =>
  PERMANENT_HTTP_STATUSES.has(status);

/** Determine if the error is retryable based on common error shapes. */
export const isRetryableError = (error: unknown): boolean => {
  if (error instanceof WorkerError) {
    return error.retryable;
  }

  const message = error instanceof Error ? error.message : String(error);

  const permanentPatterns = [
    /not found/i,
    /session_expired/i,
    /optin_required/i,
    /insufficient.*balance/i,
    /wallet.*not found/i,
    /no.*api key/i,
    /invalid.*job.*data/i,
    /workspace.*not found/i,
  ];

  if (permanentPatterns.some((pattern) => pattern.test(message))) {
    return false;
  }

  return true;
};

/**
 * Classify an axios-style error (with optional `response.status` or `status`) and
 * throw a WorkerError when the failure is permanent, or re-throw the original for
 * BullMQ retry on transient failures.
 */
export const throwIfRetryable = (error: unknown, context: string): never => {
  const message = error instanceof Error ? error.message : String(error);

  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    const status =
      typeof err?.response === 'object' && err.response !== null
        ? (err.response as Record<string, unknown>)?.status
        : typeof err?.status === 'number'
          ? err.status
          : undefined;

    if (typeof status === 'number' && isPermanentHttpError(status)) {
      throw new WorkerError(`[${context}] HTTP ${status}: ${message}`, `HTTP_${status}`, false, {
        status,
      });
    }
  }

  if (!isRetryableError(error)) {
    throw new WorkerError(`[${context}] ${message}`, 'PERMANENT_ERROR', false);
  }

  throw error instanceof Error ? error : new Error(`[${context}] ${message}`);
};
