/**
 * Logger estruturado (JSON) para worker, com contexto e correlação.
 */
export class WorkerLogger {
  private correlationId: string | undefined;
  private workspaceId: string | undefined;

  constructor(private context: string) {}

  /** Attach correlation context for the duration of a single job. */
  withContext(correlationId: string, workspaceId?: string): WorkerLogger {
    const clone = new WorkerLogger(this.context);
    clone.correlationId = correlationId;
    clone.workspaceId = workspaceId;
    return clone;
  }

  private payload(level: string, message: string, extra?: Record<string, unknown>) {
    const base: Record<string, unknown> = {
      level,
      context: this.context,
      message,
      timestamp: new Date().toISOString(),
    };
    if (this.correlationId) {
      base.correlationId = this.correlationId;
    }
    if (this.workspaceId) {
      base.workspaceId = this.workspaceId;
    }
    return JSON.stringify({ ...base, ...extra });
  }

  /** Info. */
  info(message: string, extra?: Record<string, unknown>) {
    console.log(this.payload('info', message, extra));
  }

  /** Warn. */
  warn(message: string, extra?: Record<string, unknown>) {
    console.warn(this.payload('warn', message, extra));
  }

  /** Error. */
  error(message: string, extra?: Record<string, unknown>) {
    console.error(this.payload('error', message, extra));
  }
}
