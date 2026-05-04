import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { redisInProductionValidator } from './redis-env-validator';

/**
 * Custom Joi validator for "Redis is required in production".
 *
 * Implementation moved to redis-env-validator.ts so each predicate is
 * measured on its own by complexity scanners. Contract unchanged: the
 * startup-time check ensures a Redis URL is configured and not routed
 * through Railway's public proxy when NODE_ENV=production and
 * REDIS_MODE is not explicitly disabled.
 *
 * REDIS_MODE=disabled is the documented escape hatch for partial
 * deployments that intentionally don't need Redis (e.g. a stub
 * health-check service). When set, the validator skips its check.
 */

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        // ============================================
        // VARIÁVEIS OBRIGATÓRIAS
        // ============================================
        DATABASE_URL: Joi.string().required().messages({
          'any.required': 'DATABASE_URL é obrigatória. Configure a URL do PostgreSQL.',
        }),
        JWT_SECRET: Joi.string().required().messages({
          'any.required': 'JWT_SECRET é obrigatória em produção.',
        }),

        // ============================================
        // REDIS - Pelo menos uma deve estar configurada em produção.
        // The presence check is enforced by redisInProductionValidator
        // (custom() validator at the bottom of this schema) which
        // throws at boot time when production env has no Redis.
        // ============================================
        REDIS_URL: Joi.string().optional(),
        REDIS_HOST: Joi.string().optional(),
        REDIS_PORT: Joi.number().optional(),
        REDIS_PASSWORD: Joi.string().optional(),
        REDIS_FALLBACK_URL: Joi.string().optional(),
        REDIS_MODE: Joi.string().valid('required', 'disabled', 'auto').optional(),
        // Variáveis do Railway
        REDISHOST: Joi.string().optional(),
        REDISPORT: Joi.number().optional(),
        REDISPASSWORD: Joi.string().optional(),

        // ============================================
        // CONFIGURAÇÕES DE APLICAÇÃO
        // ============================================
        JWT_EXPIRES_IN: Joi.string().default('30m'),
        AUTH_OPTIONAL: Joi.string().valid('true', 'false').default('false'),
        PORT: Joi.number().default(3001),
        FRONTEND_URL: Joi.string().default('http://localhost:3000'),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

        // ============================================
        // SEGURANÇA E OBSERVABILIDADE
        // ============================================
        METRICS_TOKEN: Joi.string().optional(),
        DIAG_TOKEN: Joi.string().optional(),
        PROVIDER_SECRET_KEY: Joi.string().optional(),
        PROVIDER_STATUS_TOKEN: Joi.string().optional(),
        HOOKS_WEBHOOK_SECRET: Joi.string().optional(),
        DLQ_WEBHOOK_URL: Joi.string().uri().optional(),
        OPS_WEBHOOK_URL: Joi.string().uri().optional(),
        QUEUE_ATTEMPTS: Joi.number().integer().min(1).optional(),
        QUEUE_BACKOFF_MS: Joi.number().integer().min(1000).optional(),
        ENFORCE_OPTIN: Joi.string().valid('true', 'false').default('false'),
        AUTOPILOT_ENFORCE_24H: Joi.string().valid('true', 'false').default('false'),
        SENTRY_DSN: Joi.string().allow('').optional(),
        DD_SERVICE: Joi.string().optional(),
        DD_ENV: Joi.string().optional(),
        DD_VERSION: Joi.string().optional(),
        DD_TRACE_AGENT_URL: Joi.string()
          .uri({ scheme: ['http', 'https', 'unix'] })
          .optional(),

        // ============================================
        // BILLING (Stripe)
        // ============================================
        STRIPE_SECRET_KEY: Joi.string().optional(),
        STRIPE_PUBLISHABLE_KEY: Joi.string().optional(),
        STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
        KLOEL_LIVE_MODE: Joi.string().valid('confirmed').optional(),
        FRAUD_BLOCK_THRESHOLD: Joi.number().min(0).max(1).optional(),
        FRAUD_REVIEW_THRESHOLD: Joi.number().min(0).max(1).optional(),
        FRAUD_REQUIRE_3DS_THRESHOLD: Joi.number().min(0).max(1).optional(),
        FRAUD_MISSING_IDENTIFIER_SCORE: Joi.number().min(0).max(1).optional(),
        FRAUD_HIGH_AMOUNT_SCORE: Joi.number().min(0).max(1).optional(),
        FRAUD_FOREIGN_BIN_SCORE: Joi.number().min(0).max(1).optional(),
        FRAUD_HIGH_AMOUNT_3DS_CENTS: Joi.number().integer().min(1).optional(),
        FRAUD_VELOCITY_WINDOW_MINUTES: Joi.number().integer().min(1).optional(),
        FRAUD_VELOCITY_MAX_ATTEMPTS_PER_IP: Joi.number().integer().min(1).optional(),
        FRAUD_VELOCITY_MAX_ATTEMPTS_PER_DEVICE: Joi.number().integer().min(1).optional(),
        FRAUD_VELOCITY_MAX_ATTEMPTS_PER_EMAIL: Joi.number().integer().min(1).optional(),
        FRAUD_VELOCITY_MAX_ATTEMPTS_PER_DOCUMENT: Joi.number().integer().min(1).optional(),
        STRIPE_PRICE_STARTER: Joi.string().optional(),
        STRIPE_PRICE_PRO: Joi.string().optional(),
        STRIPE_PRICE_ENTERPRISE: Joi.string().optional(),
        BILLING_MOCK_MODE: Joi.string().valid('true', 'false').default('false'),

        // ============================================
        // WEBHOOKS / WHATSAPP
        // ============================================
        WHATSAPP_WEBHOOK_SECRET: Joi.string().optional(),
        WHATSAPP_API_WEBHOOK_SECRET: Joi.string().optional(),
        WAHA_HOOK_URL: Joi.string().optional(),
        WAHA_HOOK_EVENTS: Joi.string().optional(),
        WAHA_WEBHOOK_SECRET: Joi.string().optional(),
        WAHA_STORE_ENABLED: Joi.string().valid('true', 'false').optional(),
        WAHA_STORE_FULL_SYNC: Joi.string().valid('true', 'false').optional(),
        WAHA_NOWEB_STORE_ENABLED: Joi.string().valid('true', 'false').optional(),
        WAHA_NOWEB_STORE_FULL_SYNC: Joi.string().valid('true', 'false').optional(),

        // ============================================
        // PAGAMENTOS (webhooks externos)
        // ============================================
        PAYMENT_WEBHOOK_SECRET: Joi.string().optional(),
        PAGHIPER_WEBHOOK_TOKEN: Joi.string().optional(),
        WC_WEBHOOK_SECRET: Joi.string().optional(),
        SHOPIFY_WEBHOOK_SECRET: Joi.string().optional(),

        // ============================================
        // FEATURES
        // ============================================
        GUEST_CHAT_ENABLED: Joi.string().valid('true', 'false').optional(),

        // ============================================
        // META WEBHOOK (WhatsApp Business API)
        // ============================================
        META_VERIFY_TOKEN: Joi.string().optional(),
        META_APP_ID: Joi.string().optional(),
        META_APP_SECRET: Joi.string().optional(),
        META_AUTH_APP_ID: Joi.string().optional(),
        META_AUTH_APP_SECRET: Joi.string().optional(),
        META_REDIRECT_URI: Joi.string().optional(),
        TIKTOK_CLIENT_KEY: Joi.string().optional(),
        TIKTOK_CLIENT_SECRET: Joi.string().optional(),

        // ============================================
        // AI PROVIDERS
        // ============================================
        OPENAI_API_KEY: Joi.string().optional(),
        OPENAI_BRAIN_MODEL: Joi.string().optional(),
        OPENAI_BRAIN_FALLBACK_MODEL: Joi.string().optional(),
        OPENAI_WRITER_MODEL: Joi.string().optional(),
        OPENAI_WRITER_FALLBACK_MODEL: Joi.string().optional(),
        OPENAI_AUDIO_UNDERSTANDING_MODEL: Joi.string().optional(),
        OPENAI_AUDIO_UNDERSTANDING_FALLBACK_MODEL: Joi.string().optional(),
        OPENAI_MODEL: Joi.string().optional(),
        OPENAI_FALLBACK_MODEL: Joi.string().optional(),
        OPENAI_TTS_VOICE: Joi.string().optional(),
        OPENAI_TTS_SPEED: Joi.string().optional(),
        VOICE_RESPONSE_AUDIO_REQUIRED: Joi.string().valid('true', 'false').optional(),

        // ============================================
        // FEATURE FLAGS / TEST ESCAPE HATCHES (PR P0-5)
        // ============================================
        // Disables auth rate limiting in tests; never set in production.
        RATE_LIMIT_DISABLED: Joi.string().valid('true', 'false').optional(),
      })
        .unknown(true)
        .custom(redisInProductionValidator, 'Redis-in-production check'),
    }),
  ],
})
export class AppConfigModule {}
