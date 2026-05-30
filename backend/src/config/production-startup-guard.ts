type StartupEnv = Record<string, string | undefined>;

const REQUIRED_PRODUCTION_SECRETS = [
  'META_APP_SECRET',
  'TIKTOK_CLIENT_SECRET',
  'EMAIL_INBOUND_SECRET',
  'GOOGLE_ADS_TOKEN_ENCRYPTION_KEY',
  'TIKTOK_TOKEN_ENCRYPTION_KEY',
  'EMAIL_TOKEN_ENCRYPTION_KEY',
  'PAYMENT_WEBHOOK_SECRET',
  'MERCADOPAGO_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

const PRODUCTION_LIVE_PREFIXES = {
  STRIPE_SECRET_KEY: 'sk_live_',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_',
} as const;

/** Assert production-only startup invariants that cannot be left conditional. */
export function assertProductionStartupSecrets(env: StartupEnv = process.env): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const missing = REQUIRED_PRODUCTION_SECRETS.filter((name) => !String(env[name] || '').trim());
  if (missing.length > 0) {
    throw new Error(
      `[STARTUP] FATAL: missing production secrets required for signed webhooks/token crypto: ${missing.join(
        ', ',
      )}`,
    );
  }

  const testModeStripeSecrets = Object.entries(PRODUCTION_LIVE_PREFIXES)
    .filter(
      ([name, prefix]) =>
        !String(env[name] || '')
          .trim()
          .startsWith(prefix),
    )
    .map(([name, prefix]) => `${name} (expected prefix ${prefix})`);

  if (testModeStripeSecrets.length > 0) {
    throw new Error(
      `[STARTUP] FATAL: production Stripe secrets must use live-mode prefixes: ${testModeStripeSecrets.join(
        ', ',
      )}`,
    );
  }
}

export const productionStartupRequiredSecrets = [...REQUIRED_PRODUCTION_SECRETS];
