import { Module, MiddlewareConsumer, NestModule, Logger } from '@nestjs/common';
import { RedisModule } from '@nestjs-modules/ioredis';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
// rawbody removed (stripe webhook controller removed)

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { WorkspaceModule } from './workspaces/workspace.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { MassSendModule } from './mass-send/mass-send.module';
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
import { FinancialAlertModule } from './common/financial-alert.module';
import { HttpTracingInterceptor } from './common/http-tracing.interceptor';
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
import { FollowUpModule } from './followup/followup.module';
import { AudioModule } from './audio/audio.module';
import { PromptSanitizerMiddleware } from './common/middleware/prompt-sanitizer.middleware';
import { CiaModule } from './cia/cia.module';
import { MemberAreaModule } from './member-area/member-area.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { MarketingModule } from './marketing/marketing.module';
import { PartnershipsModule } from './partnerships/partnerships.module';
import { VideoModule } from './video/video.module';
import { CheckoutModule } from './checkout/checkout.module';
import { KycModule } from './kyc/kyc.module';
import { ReportsModule } from './reports/reports.module';
import { MetaModule } from './meta/meta.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { getJwtSecret } from './auth/jwt-config';

const appLogger = new Logger('AppModule');
const jwtSecret = getJwtSecret();
const isProd = process.env.NODE_ENV === 'production';

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
        const isTestEnv =
          !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
        const configured = isRedisConfigured();
        let url = 'redis://localhost:6379';
        try {
          url = getRedisUrl();
        } catch (err) {
          if (isProd) {
            throw err;
          }
          if (!isTestEnv) {
            appLogger.warn(
              'Redis não configurado — usando localhost para desenvolvimento.',
            );
          }
        }

        if (!configured) {
          if (!isTestEnv) {
            appLogger.warn('============================================');
            appLogger.warn('Redis NÃO configurado - funcionalidades limitadas');
            appLogger.warn('Filas (BullMQ) e cache dependem de Redis');
            appLogger.warn(
              'Rate limit segue ativo (fallback local por processo)',
            );
            appLogger.warn(
              'Configure REDIS_URL para rate limit distribuído + filas',
            );
            appLogger.warn('============================================');
          }
        } else {
          if (!isTestEnv) appLogger.log('Redis configurado com URL resolvida');
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
    CiaModule, // 🧠 CIA Runtime Surface
    FollowUpModule, // 📅 Agendamento de follow-ups
    AudioModule, // 🎤 Transcrição de áudio
    MemberAreaModule, // 🎓 Member Areas (Cursos, Comunidades)
    AffiliateModule, // 🤝 Sistema de Afiliados
    MarketingModule, // 📊 Marketing Command Center
    PartnershipsModule, // 🤝 Partnerships (Collaborators, Affiliates, Chat)
    VideoModule, // 🎬 Video generation jobs
    CheckoutModule, // Checkout System (products, plans, orders)
    KycModule, // KYC - Know Your Customer
    ReportsModule, // Reports & Analytics (Vendas, Assinaturas, Churn, etc.)
    MetaModule, // Meta Platform (OAuth, Graph API, Webhooks)
    PipelineModule, // 🧭 Sales pipeline / CRM board
    FinancialAlertModule, // Financial alerting (global)
  ],
  controllers: [
    AppController,
    PaymentWebhookController,
    AsaasWebhookController,
  ],
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
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpTracingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Sanitiza inputs de texto em rotas de IA para prevenir prompt injection
    consumer
      .apply(PromptSanitizerMiddleware)
      .forRoutes(
        'kloel/agent/*path',
        'kloel/onboarding/*path',
        'kloel/chat/*path',
        'copilot/*path',
        'autopilot/*path',
      );
  }
}
