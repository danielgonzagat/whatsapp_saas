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
  OPENAI_MODEL: z.string().default('gpt-4o-mini').describe('Default OpenAI model'),
  
  // ========================
  // PAYMENT PROVIDERS
  // ========================
  STRIPE_SECRET_KEY: z.string().optional().describe('Stripe secret key'),
  STRIPE_WEBHOOK_SECRET: z.string().optional().describe('Stripe webhook signing secret'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().describe('Mercado Pago access token'),
  
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
    .describe('Enforce opt-in before sending messages'),
  AUTOPILOT_ENFORCE_24H: z
    .enum(['true', 'false'])
    .default('true')
    .describe('Enforce 24h window for outbound messages'),
  
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
