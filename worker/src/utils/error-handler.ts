/** Worker error. */
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

/** Handle error. */
export const handleError = (error: unknown, jobName: string) => {
  console.error('[%s] Error: %O', jobName, error);

  if (error instanceof WorkerError) {
    // Log structured error
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
