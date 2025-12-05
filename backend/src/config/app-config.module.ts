import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

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
        // REDIS - Pelo menos uma deve estar configurada em produção
        // A validação real é feita em redis.util.ts
        // ============================================
        REDIS_URL: Joi.string().optional(),
        REDIS_PUBLIC_URL: Joi.string().optional(),
        REDIS_HOST: Joi.string().optional(),
        REDIS_PORT: Joi.number().optional(),
        REDIS_PASSWORD: Joi.string().optional(),
        REDIS_FALLBACK_URL: Joi.string().optional(),
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
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        
        // ============================================
        // SEGURANÇA E OBSERVABILIDADE
        // ============================================
        METRICS_TOKEN: Joi.string().optional(),
        PROVIDER_SECRET_KEY: Joi.string().optional(),
        DLQ_WEBHOOK_URL: Joi.string().uri().optional(),
        OPS_WEBHOOK_URL: Joi.string().uri().optional(),
        QUEUE_ATTEMPTS: Joi.number().integer().min(1).optional(),
        QUEUE_BACKOFF_MS: Joi.number().integer().min(1000).optional(),
        ENFORCE_OPTIN: Joi.string().valid('true', 'false').default('false'),
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
        ELEVENLABS_API_KEY: Joi.string().optional(),
      }),
    }),
  ],
})
export class AppConfigModule {}
