const sentryEnabled = process.env.KLOEL_ENABLE_SENTRY_BUILD === 'true';

async function getSentry() {
  if (!sentryEnabled) return null;
  return import('@sentry/nextjs');
}

export async function register() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const Sentry = await getSentry();
  if (!Sentry) return;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    enabled: true,
  });
}

export async function onRequestError(...args: any[]) {
  const Sentry = await getSentry();
  if (!Sentry) return;
  return (Sentry.captureRequestError as (...params: any[]) => any)(...args);
}
