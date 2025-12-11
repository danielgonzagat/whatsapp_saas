import { Module } from '@nestjs/common';
import { RedisModule } from '@nestjs-modules/ioredis';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
// rawbody removed (stripe webhook controller removed)

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { WorkspaceModule } from './workspaces/workspace.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { MassSendModule } from './mass-send/mass-send.module';
import { FunnelsModule } from './funnels/funnels.module';
import { FlowsModule } from './flows/flows.module';
import { CrmModule } from './crm/crm.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ScrapersModule } from './scrapers/scrapers.module';
import { InboxModule } from './inbox/inbox.module';
import { BillingModule } from './billing/billing.module';
import { AuthModule } from './auth/auth.module'; // Enabled AuthModule
import { JwtAuthGuard } from './auth/jwt-auth.guard'; // Enabled JwtAuthGuard
import { RolesGuard } from './auth/roles.guard'; // Enabled RolesGuard
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { RequestLoggerInterceptor } from './common/request-logger.interceptor';
import { LaunchModule } from './launch/launch.module';
import { MediaModule } from './media/media.module';
import { VoiceModule } from './voice/voice.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppConfigModule } from './config/app-config.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { TeamModule } from './team/team.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RequestIdInterceptor } from './common/request-id.interceptor';
import { AlertsGateway } from './alerts/alerts.gateway';
import { JwtModule } from '@nestjs/jwt';

import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { MarketplaceModule } from './marketplace/marketplace.module';
import { AuditModule } from './audit/audit.module';
import { AutopilotModule } from './autopilot/autopilot.module';
import { CopilotModule } from './copilot/copilot.module';
import { PublicApiModule } from './public-api/public-api.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { OpsModule } from './ops/ops.module';
import { AiBrainModule } from './ai-brain/ai-brain.module';
import { GrowthModule } from './growth/growth.module';
import { PaymentWebhookController } from './webhooks/payment-webhook.controller';
import { AsaasWebhookController } from './webhooks/asaas-webhook.controller';
import { KloelModule } from './kloel/kloel.module';
import { CalendarModule } from './calendar/calendar.module';
import { I18nModule } from './i18n/i18n.module';
import { StorageModule } from './common/storage/storage.module';
import { getRedisUrl, isRedisConfigured } from './common/redis/redis.util';

// JWT Secret - Em produção, emite aviso mas não derruba a aplicação
const isProd = process.env.NODE_ENV === 'production';
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && isProd) {
  throw new Error('JWT_SECRET é obrigatório em produção.');
}
if (!jwtSecret && !isProd) {
  jwtSecret = 'dev-secret-insecure';
  console.warn(
    '⚠️ JWT_SECRET not set, using weak dev-secret (dev only). Configure JWT_SECRET.',
  );
}

@Module({
  imports: [
    // Variáveis de ambiente com validação Joi
    AppConfigModule,
    PublicApiModule,
    JwtModule.register({
      global: true,
      secret: jwtSecret,
    }),

    // Rate Limiting Global
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Internacionalização global
    I18nModule,

    // Storage (local / S3 / R2)
    StorageModule,

    // Prisma (banco principal)
    PrismaModule,

    // Redis para filas e workers - SEMPRE carregado para satisfazer @InjectRedis()
    // Se Redis não estiver configurado, usa URL fictícia e conexões falham silenciosamente
    RedisModule.forRootAsync({
      useFactory: () => {
        const configured = isRedisConfigured();
        let url = 'redis://localhost:6379';
        try {
          url = getRedisUrl();
        } catch (err) {
          if (isProd) {
            throw err;
          }
          console.warn(
            '⚠️ Redis não configurado — usando localhost para desenvolvimento.',
          );
        }

        if (!configured) {
          console.warn('');
          console.warn('⚠️ ============================================');
          console.warn('⚠️ Redis NÃO configurado - funcionalidades limitadas');
          console.warn('⚠️ Rate limiting, filas e cache desativados');
          console.warn('⚠️ Configure REDIS_URL para habilitar');
          console.warn('⚠️ ============================================');
          console.warn('');
        } else {
          console.log('🔌 [APP] Redis configurado com URL resolvida');
        }

        return {
          type: 'single' as const,
          url,
          options: {
            maxRetriesPerRequest: null,
            enableReadyCheck: false, // Não verifica conexão na inicialização
            lazyConnect: true, // Conecta apenas quando usado
            retryStrategy: (times: number) => {
              if (!configured) return null; // Não reconecta se não configurado
              return Math.min(times * 50, 2000);
            },
            reconnectOnError: () => configured, // Reconecta apenas se configurado
          },
        };
      },
    }),

    // Módulos de domínio
    WorkspaceModule,
    WhatsappModule,
    MassSendModule,
    FunnelsModule,
    FlowsModule,
    CrmModule,
    CampaignsModule,
    ScrapersModule,
    InboxModule,
    BillingModule,
    AuthModule, // Enabled AuthModule
    HealthModule,
    MetricsModule,
    LaunchModule,
    MediaModule,
    VoiceModule,
    DashboardModule,
    AnalyticsModule,
    OpsModule,
    WebhooksModule,
    TeamModule,
    NotificationsModule,
    MarketplaceModule,
    AuditModule,
    AutopilotModule,
    CopilotModule,
    AiBrainModule,
    GrowthModule,
    CalendarModule, // 📅 Integração com calendários
    KloelModule, // 🧠 KLOEL - IA Comercial Autônoma
  ],
  controllers: [AppController, PaymentWebhookController, AsaasWebhookController],
  providers: [
    AppService,
    AlertsGateway,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Enabled JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // Enabled RolesGuard
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggerInterceptor,
    },
  ],
})
export class AppModule {}
