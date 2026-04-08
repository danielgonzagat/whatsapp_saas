import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

const logger = new Logger('Sentry');

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });

  // Sinaliza no log quando ativo
  logger.log('Sentry inicializado (backend).');
}

export function captureException(err: any) {
  // v8+ removed `Sentry.getCurrentHub()`. Use `Sentry.getClient()` directly
  // to detect whether Sentry was initialized for this process.
  const client = Sentry.getClient();
  if (!client) return;
  Sentry.captureException(err);
}
