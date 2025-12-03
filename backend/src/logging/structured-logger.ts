/**
 * Logger simples com formato estruturado (JSON) para facilitar ingestão
 * em ferramentas como Grafana/Loki/ELK.
 */
export class StructuredLogger {
  constructor(private context: string) {}

  private serialize(
    level: string,
    message: string,
    extra?: Record<string, any>,
  ) {
    const payload = {
      level,
      context: this.context,
      message,
      timestamp: new Date().toISOString(),
      ...(extra || {}),
    };
    return JSON.stringify(payload);
  }

  info(message: string, extra?: Record<string, any>) {
    console.log(this.serialize('info', message, extra));
  }

  warn(message: string, extra?: Record<string, any>) {
    console.warn(this.serialize('warn', message, extra));
  }

  error(message: string, extra?: Record<string, any>) {
    console.error(this.serialize('error', message, extra));
  }
}
