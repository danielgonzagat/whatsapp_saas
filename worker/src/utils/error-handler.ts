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
  const safeMessage = error instanceof Error ? error.message : String(error);
  const safeName = error instanceof Error ? error.name : typeof error;
  console.error('[%s] Error: %s (%s)', jobName, safeMessage, safeName);

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
    error: safeMessage,
    code: 'UNKNOWN_ERROR',
    retryable: true,
  };
};
