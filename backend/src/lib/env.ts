/**
 * Environment validation using Zod.
 * Validates all required environment variables at startup.
 *
 * USAGE:
 *   import { env, validateEnv } from './env';
 *   validateEnv(); // Call once at startup, throws if invalid
 *   console.log(env.DATABASE_URL);
 */

import { z } from 'zod';

/**
 * Schema for environment variables.
 * Add all required and optional env vars here.
 */
const envSchema = z.object({
  // ========================
  // DATABASE
  // ========================
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),

  // ========================
  // REDIS
  // ========================
  REDIS_URL: z.string().default('redis://localhost:6379').describe('Redis connection URL'),

  // ========================
  // AUTH / JWT
  // ========================
  JWT_SECRET: z.string().min(32).optional().describe('JWT signing secret (min 32 chars)'),
  NEXTAUTH_SECRET: z.string().min(32).optional().describe('NextAuth secret'),
  NEXTAUTH_URL: z.string().url().optional().describe('NextAuth base URL'),
  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .describe('Google OAuth Client ID for GIS / ID token validation'),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .optional()
    .describe('Google OAuth Client Secret (optional for GIS ID token flow)'),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .describe('Frontend Google OAuth Client ID, mirrored for backend fallback'),

  // ========================
  // ENCRYPTION
  // ========================
  ENCRYPTION_KEY: z
    .string()
    .min(32)
    .optional()
    .describe('AES-256 encryption key for sensitive data'),
  PROVIDER_SECRET_KEY: z
    .string()
    .optional()
    .describe('Legacy encryption key for provider credentials'),

  // ========================
  // WHATSAPP CLOUD API (Meta)
  // ========================
  META_APP_SECRET: z.string().optional().describe('Meta App Secret for webhook signature'),
  META_VERIFY_TOKEN: z.string().optional().describe('Meta webhook verification token'),
  META_ACCESS_TOKEN: z.string().optional().describe('Meta Graph API access token'),
  META_PHONE_NUMBER_ID: z.string().optional().describe('Meta WhatsApp phone number ID'),
  META_WABA_ID: z.string().optional().describe('WhatsApp Business Account ID'),

  // ========================
  // OPENAI
  // ========================
  OPENAI_API_KEY: z.string().optional().describe('OpenAI API key'),
  OPENAI_BRAIN_MODEL: z
    .string()
    .default('gpt-5.4')
    .describe('Primary OpenAI model used for reasoning and tool decisions'),
  OPENAI_BRAIN_FALLBACK_MODEL: z
    .string()
    .default('gpt-4.1')
    .describe('Fallback OpenAI model for reasoning flows'),
  OPENAI_WRITER_MODEL: z
    .string()
    .default('gpt-5.4-nano-2026-03-17')
    .describe('Primary OpenAI model used to write final user-facing replies'),
  OPENAI_WRITER_FALLBACK_MODEL: z
    .string()
    .default('gpt-4.1')
    .describe('Fallback OpenAI model for user-facing reply generation'),
  OPENAI_AUDIO_UNDERSTANDING_MODEL: z
    .string()
    .default('gpt-tempo-real-1.5')
    .describe('Primary OpenAI model used to understand inbound audio'),
  OPENAI_AUDIO_UNDERSTANDING_FALLBACK_MODEL: z
    .string()
    .default('gpt-4o-mini-transcribe')
    .describe('Fallback OpenAI model used to understand inbound audio'),
  OPENAI_MODEL: z
    .string()
    .default('gpt-5.4-nano-2026-03-17')
    .describe('Legacy alias for OPENAI_WRITER_MODEL'),
  OPENAI_FALLBACK_MODEL: z
    .string()
    .default('gpt-4.1')
    .describe('Legacy alias for OPENAI_WRITER_FALLBACK_MODEL'),
  OPENAI_TTS_VOICE: z
    .string()
    .default('nova')
    .describe('OpenAI TTS voice name (alloy, echo, fable, onyx, nova, shimmer)'),
  OPENAI_TTS_SPEED: z.string().default('1.0').describe('OpenAI TTS speed (0.25 to 4.0)'),
  VOICE_RESPONSE_AUDIO_REQUIRED: z
    .enum(['true', 'false'])
    .default('false')
    .describe('Whether inbound audio must always receive audio output'),

  // ========================
  // PAYMENT PROVIDERS
  // ========================
  STRIPE_SECRET_KEY: z.string().optional().describe('Stripe secret key (sk_test_* or sk_live_*)'),
  STRIPE_PUBLISHABLE_KEY: z
    .string()
    .optional()
    .describe('Stripe publishable key (pk_test_* or pk_live_*); safe to expose to frontend'),
  STRIPE_RESTRICTED_KEY: z
    .string()
    .optional()
    .describe('Stripe restricted key (rk_test_* or rk_live_*) for scoped automation'),
  STRIPE_WEBHOOK_SECRET: z.string().optional().describe('Stripe webhook signing secret'),
  ASAAS_API_KEY: z
    .string()
    .optional()
    .describe('Platform-managed Asaas API key used internally by Kloel'),
  ASAAS_ENVIRONMENT: z
    .enum(['sandbox', 'production'])
    .optional()
    .describe('Environment for the platform-managed Asaas integration'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().describe('Mercado Pago access token'),
  MERCADOPAGO_PUBLIC_KEY: z.string().optional().describe('Mercado Pago public key'),
  MERCADOPAGO_CLIENT_ID: z.string().optional().describe('Mercado Pago OAuth client id'),
  MERCADOPAGO_CLIENT_SECRET: z.string().optional().describe('Mercado Pago OAuth client secret'),
  MERCADOPAGO_CONNECTION_MODE: z
    .enum(['oauth', 'platform_managed'])
    .optional()
    .describe('Mercado Pago connection mode for Kloel checkout'),
  MERCADOPAGO_OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .optional()
    .describe('Fixed public OAuth callback URL for Mercado Pago'),
  MERCADOPAGO_NOTIFICATION_URL: z
    .string()
    .url()
    .optional()
    .describe('Fixed public notification URL for Mercado Pago payment events'),
  MERCADOPAGO_PLATFORM_ID: z
    .string()
    .optional()
    .describe('Mercado Pago platform id for marketplace-grade integrations'),
  MERCADOPAGO_INTEGRATOR_ID: z
    .string()
    .optional()
    .describe('Mercado Pago integrator id provided by Mercado Pago'),
  MERCADOPAGO_CORPORATION_ID: z
    .string()
    .optional()
    .describe('Mercado Pago corporation id when required by the account'),
  MERCADOPAGO_3DS_VALIDATION: z
    .enum(['always', 'on_fraud_risk', 'never'])
    .optional()
    .describe('Mercado Pago 3DS validation policy'),
  MERCADOPAGO_3DS_LIABILITY_SHIFT: z
    .enum(['required', 'preferred'])
    .optional()
    .describe('Mercado Pago 3DS liability shift policy'),
  MERCADOPAGO_PAYMENT_3DS_MODE: z
    .enum(['optional', 'mandatory'])
    .optional()
    .describe('Mercado Pago Payment API 3DS mode'),
  MERCADOPAGO_WEBHOOK_SECRET: z
    .string()
    .optional()
    .describe('Mercado Pago webhook secret signature key'),

  // ========================
  // WEBHOOKS
  // ========================
  HOOKS_WEBHOOK_SECRET: z.string().optional().describe('Internal webhook signature secret'),
  OPS_WEBHOOK_URL: z.string().url().optional().describe('Ops alerts webhook URL'),
  AUTOPILOT_ALERT_WEBHOOK: z.string().url().optional().describe('Autopilot alerts webhook'),
  DLQ_WEBHOOK_URL: z.string().url().optional().describe('Dead letter queue alerts'),

  // ========================
  // FEATURE FLAGS
  // ========================
  ENFORCE_OPTIN: z
    .enum(['true', 'false'])
    .default('false')
    .describe('Enforce opt-in before sending messages'), // messageLimit: enforced via PlanLimitsService
  AUTOPILOT_ENFORCE_24H: z
    .enum(['true', 'false'])
    .default('false')
    .describe('Enforce 24h window for outbound messages'),
  WAHA_ALLOW_SESSION_WITHOUT_WEBHOOK: z
    .enum(['true', 'false'])
    .default('false')
    .describe('Allow starting WAHA sessions without a public webhook'),
  WAHA_ALLOW_INTERNAL_WEBHOOK_URL: z
    .enum(['true', 'false'])
    .default('false')
    .describe('Allow internal/private webhook URLs for WAHA in controlled environments'),

  // ========================
  // SENTRY
  // ========================
  SENTRY_DSN: z.string().url().optional().describe('Sentry DSN for error tracking'),

  // ========================
  // SERVER
  // ========================
  PORT: z.string().default('3001').transform(Number).describe('Server port'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development')
    .describe('Node environment'),
});

// Infer type from schema
type Env = z.infer<typeof envSchema>;

// Parsed and validated env object
let _env: Env | null = null;

/**
 * Validates environment variables against the schema.
 * Call this once at application startup.
 *
 * @throws Error with detailed message if validation fails
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path}: ${issue.message}`;
    });

    console.error('❌ Environment validation failed:');
    console.error(errors.join('\n'));

    throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
  }

  _env = result.data;
  return result.data;
}

/**
 * Get validated environment object.
 * Must call validateEnv() first.
 */
export function getEnv(): Env {
  if (!_env) {
    // Auto-validate on first access if not already done
    return validateEnv();
  }
  return _env;
}

/**
 * Proxy for accessing env vars with validation.
 * Use this instead of process.env for type safety.
 */
export const env = new Proxy({} as Env, {
  get(_, prop: string) {
    const envObj = getEnv();
    return envObj[prop as keyof Env];
  },
});

/**
 * Check if a required env var is set (non-empty).
 */
export function isEnvSet(key: keyof Env): boolean {
  const value = process.env[key];
  return value !== undefined && value !== '';
}

/**
 * Get list of missing optional env vars that should be set for production.
 */
export function getProductionWarnings(): string[] {
  const warnings: string[] = [];

  const recommendedForProd: (keyof Env)[] = [
    'ENCRYPTION_KEY',
    'JWT_SECRET',
    'SENTRY_DSN',
    'META_APP_SECRET',
    'STRIPE_WEBHOOK_SECRET',
    'HOOKS_WEBHOOK_SECRET',
  ];

  for (const key of recommendedForProd) {
    if (!isEnvSet(key)) {
      warnings.push(`⚠️  ${key} is not set (recommended for production)`);
    }
  }

  return warnings;
}
