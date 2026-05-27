import { Logger } from '@nestjs/common';
import { getCorrelationId } from '../common/observability/correlation-store';

type LogExtra = Record<string, unknown>;

// Extends NestJS Logger so TS treats StructuredLogger as a Logger subtype.
// All public methods are overridden; base class properties (options,
// localInstance, registerLocalInstanceRef, fatal) come along for free and
// are unused by our serialization path.
export class StructuredLogger extends Logger {
  private readonly correlationId: string | undefined;

  constructor(override readonly context: string) {
    super(context);
    this.correlationId = getCorrelationId();
  }

  static from(
    context: string | { name?: string; constructor?: { name?: string } },
  ): StructuredLogger {
    const name =
      typeof context === 'string'
        ? context
        : context?.name || context?.constructor?.name || 'unknown';
    return new StructuredLogger(name);
  }

  private isTestEnv() {
    return !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
  }

  private serialize(level: string, message: string, extra?: LogExtra) {
    const cid = this.correlationId || getCorrelationId();
    const payload: Record<string, unknown> = {
      level,
      context: this.context,
      message,
      timestamp: new Date().toISOString(),
      ...(cid ? { correlationId: cid } : {}),
      ...(extra || {}),
    };
    return JSON.stringify(payload);
  }

  // Argument normalization. Accepts:
  //   (message: string, context?: string)
  //   (message: string, extra?: LogExtra)
  //   (data: LogExtra, message?: string)  // pino-style
  //   (message: string, err: unknown)     // catch-all compat
  // Returns { message, extra } the serializer can use.
  private normalize(
    a: string | LogExtra,
    b?: string | LogExtra,
  ): { message: string; extra?: LogExtra } {
    if (typeof a === 'string') {
      if (b === undefined || b === null) {return { message: a };}
      if (typeof b === 'string') {return { message: a, extra: { context: b } };}
      if (typeof b === 'object') {return { message: a, extra: b };}
      return { message: a, extra: { raw: String(b) } };
    }
    const message = typeof b === 'string' ? b : '';
    return { message, extra: a };
  }

  override log(message: string, context?: string): void;
  override log(message: string, extra?: LogExtra): void;
  override log(data: LogExtra, message?: string): void;
  override log(message: string, err: unknown): void;
  override log(a: string | LogExtra, b?: string | LogExtra | unknown): void {
    this.info(a as never, b as never);
  }

  info(message: string, context?: string): void;
  info(message: string, extra?: LogExtra): void;
  info(data: LogExtra, message?: string): void;
  info(message: string, err: unknown): void;
  info(a: string | LogExtra, b?: string | LogExtra | unknown): void {
    if (this.isTestEnv()) {return;}
    const { message, extra } = this.normalize(
      a,
      b as string | LogExtra | undefined,
    );
    console.log(this.serialize('info', message, extra));
  }

  override warn(message: string, context?: string): void;
  override warn(message: string, extra?: LogExtra): void;
  override warn(data: LogExtra, message?: string): void;
  override warn(message: string, err: unknown): void;
  override warn(message: string, context: string, extra: LogExtra): void;
  override warn(
    a: string | LogExtra,
    b?: string | LogExtra | unknown,
    c?: string | LogExtra,
  ): void {
    if (this.isTestEnv()) {return;}
    if (c !== undefined) {
      let extra: LogExtra = {};
      if (typeof b === 'string') {extra = { context: b };}
      else if (b && typeof b === 'object') {extra = { ...(b as LogExtra) };}
      if (typeof c === 'string') {extra = { ...extra, context: c };}
      else if (c && typeof c === 'object') {extra = { ...extra, ...c };}
      console.warn(this.serialize('warn', a as string, extra));
      return;
    }
    const { message, extra } = this.normalize(
      a,
      b as string | LogExtra | undefined,
    );
    console.warn(this.serialize('warn', message, extra));
  }

  override error(message: string, stack?: string, context?: string): void;
  override error(message: string, stack: string | undefined, extra: LogExtra): void;
  override error(message: string, extra?: LogExtra): void;
  override error(message: string, err: unknown): void;
  override error(data: LogExtra, message?: string): void;
  override error(data: LogExtra, stack?: string, context?: string | unknown): void;
  override error(message: unknown, extra?: LogExtra): void;
  override error(
    a: string | LogExtra | unknown,
    b?: string | LogExtra | unknown,
    c?: string | LogExtra,
  ): void {
    if (this.isTestEnv()) {return;}
    let message: string;
    let extra: LogExtra = {};
    if (typeof a === 'string') {
      message = a;
      if (typeof b === 'string') {
        extra.stack = b;
      } else if (b && typeof b === 'object') {
        extra = { ...(b as LogExtra) };
      } else if (b !== undefined && b !== null) {
        extra = { raw: String(b) };
      }
      if (typeof c === 'string') {
        extra.context = c;
      } else if (c) {
        extra = { ...extra, ...c };
      }
    } else if (a && typeof a === 'object' && !(a instanceof Error)) {
      extra = { ...(a as LogExtra) };
      if (c !== undefined) {
        if (typeof b === 'string') {extra.stack = b;}
        else if (b) {extra = { ...extra, ...(b as LogExtra) };}
        if (typeof c === 'string') {extra.context = c;}
        else if (c instanceof Error) {
          extra.error = c.message;
          extra.errorName = c.constructor.name;
        } else if (typeof c === 'object') {
          extra = { ...extra, ...(c) };
        }
        message = typeof b === 'string' ? b : '';
      } else {
        message = typeof b === 'string' ? b : '';
      }
    } else {
      message = a instanceof Error ? a.message || 'Unknown error' : String(a);
      if (b && typeof b === 'object' && !(typeof b === 'string')) {
        extra = { ...b, errorName: a instanceof Error ? a.constructor.name : undefined };
      } else if (typeof b === 'string') {
        extra = { context: b };
      }
    }
    console.error(this.serialize('error', message, extra));
  }

  override debug(message: string, context?: string): void;
  override debug(message: string, extra?: LogExtra): void;
  override debug(data: LogExtra, message?: string): void;
  override debug(message: string, err: unknown): void;
  override debug(a: string | LogExtra, b?: string | LogExtra | unknown): void {
    this.info(a as never, b as never);
  }

  override verbose(message: string, context?: string): void;
  override verbose(message: string, extra?: LogExtra): void;
  override verbose(data: LogExtra, message?: string): void;
  override verbose(message: string, err: unknown): void;
  override verbose(a: string | LogExtra, b?: string | LogExtra | unknown): void {
    this.info(a as never, b as never);
  }
}
