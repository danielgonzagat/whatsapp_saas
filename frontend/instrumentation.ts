export async function register() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const Sentry = await import('@sentry/nextjs');

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    enabled: true,
  });
}
