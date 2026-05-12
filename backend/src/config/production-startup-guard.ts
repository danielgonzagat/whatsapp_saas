type StartupEnv = Record<string, string | undefined>;

const REQUIRED_PRODUCTION_SECRETS = [
  'META_APP_SECRET',
  'TIKTOK_CLIENT_SECRET',
  'EMAIL_INBOUND_SECRET',
  'EMAIL_TOKEN_ENCRYPTION_KEY',
  'PAYMENT_WEBHOOK_SECRET',
  'MERCADOPAGO_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET',
] as const;

/** Assert production-only startup invariants that cannot be left conditional. */
export function assertProductionStartupSecrets(env: StartupEnv = process.env): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const missing = REQUIRED_PRODUCTION_SECRETS.filter((name) => !String(env[name] || '').trim());
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `[STARTUP] FATAL: missing production secrets required for signed webhooks/token crypto: ${missing.join(
      ', ',
    )}`,
  );
}

export const productionStartupRequiredSecrets = [...REQUIRED_PRODUCTION_SECRETS];
