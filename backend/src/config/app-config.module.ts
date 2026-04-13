import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

/**
 * Custom Joi validator for "Redis is required in production".
 *
 * The original schema marked every Redis var as `.optional()` because
 * each is independently optional — what matters is that AT LEAST ONE
 * resolves to a usable URL. Before P3-2 the runtime resolver
 * (resolve-redis-url.ts) was the only enforcer, which meant boot
 * could succeed in production with no Redis at all and only fail at
 * the first cache/queue/rate-limit call. PR P3-2 adds a startup-time
 * check so the failure is loud and immediate.
 *
 * REDIS_MODE=disabled is the documented escape hatch for partial
 * deployments that intentionally don't need Redis (e.g. a stub
 * health-check service). When set, this validator skips its check.
 */
function redisInProductionValidator(value: Record<string, unknown>): Record<string, unknown> {
  const isProd = value.NODE_ENV === 'production';
  const mode = String(value.REDIS_MODE || '').toLowerCase();
  if (!isProd) return value;
  if (mode === 'disabled') return value;

  const hasUrl = !!(value.REDIS_URL || value.REDIS_FALLBACK_URL);
  const hasComponents =
    !!(value.REDIS_HOST || value.REDISHOST) && !!(value.REDIS_PASSWORD || value.REDISPASSWORD);

  if (!hasUrl && !hasComponents) {
    throw new Error(
      'Redis is required in production but no Redis URL could be resolved from env. ' +
        'Set REDIS_URL, REDIS_FALLBACK_URL, or REDIS_HOST + REDIS_PASSWORD. ' +
        'To opt out entirely, set REDIS_MODE=disabled.',
    );
  }

  const candidates = [
    String(value.REDIS_URL || ''),
    String(value.REDIS_FALLBACK_URL || ''),
    String(value.REDIS_HOST || value.REDISHOST || ''),
  ].filter(Boolean);

  if (
    candidates.some(
      (candidate) =>
        candidate.includes('mainline.proxy.rlwy.net') || candidate.includes('.proxy.rlwy.net'),
    )
  ) {
    throw new Error(
      'Redis must use Railway internal networking in production. ' +
        'Configure REDIS_URL from the Redis service (for example redis://default:***@redis.railway.internal:6379) ' +
        'and remove REDIS_PUBLIC_URL/public proxy hosts from backend/worker env.',
    );
  }
  return value;
}

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
        SENTRY_DSN: Joi.string().optional(),

        // ============================================
        // BILLING (Stripe)
        // ============================================
        STRIPE_SECRET_KEY: Joi.string().optional(),
        STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
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
        ASAAS_WEBHOOK_TOKEN: Joi.string().optional(),
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
        META_REDIRECT_URI: Joi.string().optional(),

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
