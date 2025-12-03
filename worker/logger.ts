/**
 * Logger estruturado (JSON) para worker, com contexto e correlação.
 */
export class WorkerLogger {
  constructor(private context: string) {}

  private payload(level: string, message: string, extra?: Record<string, any>) {
    return JSON.stringify({
      level,
      context: this.context,
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  }

  info(message: string, extra?: Record<string, any>) {
    console.log(this.payload('info', message, extra));
  }

  warn(message: string, extra?: Record<string, any>) {
    console.warn(this.payload('warn', message, extra));
  }

  error(message: string, extra?: Record<string, any>) {
    console.error(this.payload('error', message, extra));
  }
}
