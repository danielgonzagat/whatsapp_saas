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
import { KloelModule } from './kloel/kloel.module';
import { getRedisUrl, isRedisConfigured } from './common/redis/redis.util';

// JWT Secret - Em produção, emite aviso mas não derruba a aplicação
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-insecure';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('');
  console.error('⚠️ ============================================');
  console.error('⚠️ JWT_SECRET não definido em produção!');
  console.error('⚠️ Autenticação JWT usará chave insegura.');
  console.error('⚠️ Configure JWT_SECRET para segurança adequada.');
  console.error('⚠️ ============================================');
  console.error('');
}
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'production') {
  console.warn(
    '⚠️ JWT_SECRET not set, using weak dev-secret. Set JWT_SECRET ASAP.',
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

    // Prisma (banco principal)
    PrismaModule,

    // Redis para filas e workers - usa forRootAsync para resolver URL de forma lazy
    // Isso garante que o bootstrap.ts já interceptou o ioredis antes da conexão
    // Se Redis não estiver configurado, o módulo ainda será carregado mas conexões falharão graciosamente
    ...(isRedisConfigured() ? [
      RedisModule.forRootAsync({
        useFactory: () => {
          const url = getRedisUrl();
          console.log('🔌 [APP] Configurando RedisModule com URL resolvida');
          return {
            type: 'single' as const,
            url,
            options: {
              maxRetriesPerRequest: null, // Evita MaxRetriesPerRequestError
              enableReadyCheck: true,
              retryStrategy: (times: number) => Math.min(times * 50, 2000),
            },
          };
        },
      }),
    ] : []),

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
    KloelModule, // 🧠 KLOEL - IA Comercial Autônoma
  ],
  controllers: [AppController, PaymentWebhookController],
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
