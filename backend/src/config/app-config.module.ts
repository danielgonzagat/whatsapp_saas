import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://127.0.0.1:6379'),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('30m'),
        AUTH_OPTIONAL: Joi.string().valid('true', 'false').default('false'),
        PORT: Joi.number().default(3001),
        FRONTEND_URL: Joi.string().default('http://localhost:3000'),
        // Segurança/observabilidade
        METRICS_TOKEN: Joi.string().optional(),
        PROVIDER_SECRET_KEY: Joi.string().optional(),
        DLQ_WEBHOOK_URL: Joi.string().uri().optional(),
        OPS_WEBHOOK_URL: Joi.string().uri().optional(),
        QUEUE_ATTEMPTS: Joi.number().integer().min(1).optional(),
        QUEUE_BACKOFF_MS: Joi.number().integer().min(1000).optional(),
        ENFORCE_OPTIN: Joi.string().valid('true', 'false').default('false'),
        // Billing
        STRIPE_SECRET_KEY: Joi.string().optional(),
        STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
        STRIPE_PRICE_STARTER: Joi.string().optional(),
        STRIPE_PRICE_PRO: Joi.string().optional(),
        STRIPE_PRICE_ENTERPRISE: Joi.string().optional(),
        BILLING_MOCK_MODE: Joi.string().valid('true', 'false').default('false'),
        // Meta Webhook
        META_VERIFY_TOKEN: Joi.string().optional(),
        META_APP_ID: Joi.string().optional(),
        META_APP_SECRET: Joi.string().optional(),
        META_REDIRECT_URI: Joi.string().optional(),
        // AI Providers
        OPENAI_API_KEY: Joi.string().optional(),
        ELEVENLABS_API_KEY: Joi.string().optional(),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
      }),
    }),
  ],
})
export class AppConfigModule {}
