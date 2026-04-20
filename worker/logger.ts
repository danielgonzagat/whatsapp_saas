/**
 * Logger estruturado (JSON) para worker, com contexto e correlação.
 */
export class WorkerLogger {
  constructor(private context: string) {}

  private payload(level: string, message: string, extra?: Record<string, unknown>) {
    return JSON.stringify({
      level,
      context: this.context,
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    });
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
