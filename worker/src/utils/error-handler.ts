export class WorkerError extends Error {
  constructor(
    public message: string,
    public code: string,
    public retryable: boolean = true,
    public metadata: any = {}
  ) {
    super(message);
    this.name = 'WorkerError';
  }
}

export const handleError = (error: any, jobName: string) => {
  console.error(`[${jobName}] Error:`, error);
  
  if (error instanceof WorkerError) {
    // Log structured error
    return {
      success: false,
      error: error.message,
      code: error.code,
      retryable: error.retryable
    };
  }

  return {
    success: false,
    error: error.message || 'Unknown error',
    code: 'UNKNOWN_ERROR',
    retryable: true
  };
};
